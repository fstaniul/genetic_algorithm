import { chunk, flatten, noConflict } from "lodash";

export type Population = Individual[];
export type FittingFunction = (x: number) => number;

export namespace GeneticAlgorithm {
    export interface Options {
        populationSize: number;
        genotypeSize: number;
        crossingProbability: number;
        mutationProbability: number;
        fittingFunction: FittingFunction;
    }

    export interface RunOptions {
        maxIterations: number;
        maxBestOccurrences: number;
        afterIteration?: (iteration: number, data: IterationData) => void;
        modifyPopulationBeforeScoring?: (population: Population) => Population;
    }

    export interface IterationData {
        population: Population;
        individualsScore: number[];
        best: Individual;
        score: number;
    }

    export interface Result {
        answer: number;
        iterations: number;
        lastIteration: IterationData;
    }
}

export class Individual {
    genotype: number;
    size: number;

    constructor(size: number, genotype?: number) {
        if (!genotype) {
            genotype = 0;
            for (let i = 0; i < size; i++) {
                const oneOrZero = Math.round(Math.random());
                genotype = genotype | (oneOrZero << i);
            }
        }

        this.genotype = genotype;
        this.size = size;
    }

    score(this: Individual, fittingFunction: FittingFunction): number {
        return fittingFunction(this.genotype);
    }

    toString(this: Individual): string {
        return this.genotype.toString(2).padStart(this.size, "0");
    }

    toJSON(this: Individual): object {
        return {
            genotype: this.genotype.toString(2).padStart(this.size, "0"),
            size: this.size,
        };
    }
}

export function createIndividual(genotypeSize: number): Individual;
export function createIndividual(
    genotypeSize: number,
    genotype: number
): Individual;
export function createIndividual(
    genotypeSize: number,
    genotype?: number
): Individual {
    return new Individual(genotypeSize, genotype);
}

export function createPopulation(
    populationSize: number,
    byteSize: number
): Population {
    const population: Population = [];
    for (let i = 0; i < populationSize; i++) {
        const individual = createIndividual(byteSize);
        population.push(individual);
    }
    return population;
}

export function crossover(
    parent1: Individual,
    parent2: Individual
): [Individual, Individual] {
    const crossoverPoint = Math.floor(Math.random() * parent1.size);
    const mask = (1 << crossoverPoint) - 1;

    const child1 = createIndividual(
        parent1.size,
        (parent1.genotype & ~mask) | (parent2.genotype & mask)
    );
    const child2 = createIndividual(
        parent1.size,
        (parent2.genotype & ~mask) | (parent1.genotype & mask)
    );

    return [child1, child2];
}

export function mutate(individual: Individual): Individual {
    const mutationPoint = Math.floor(Math.random() * individual.size);
    const mask = 1 << mutationPoint;
    return createIndividual(individual.size, individual.genotype ^ mask);
}

export function fitness(
    individual: Individual,
    fittingFunction: FittingFunction
): number {
    return fittingFunction(individual.genotype);
}

export function selection(population: Population, individualsScore: number[], populationScore: number): Population {
    const individualsFitting = individualsScore.map((score) => score / populationScore);
    const newPopulation: Population = [];
    for (let i = 0; i < population.length; i++) {
        const fitting = Math.random();
        let sum = 0;
        for (let k = 0; k < population.length; k++) {
            sum += individualsFitting[k];
            if (sum >= fitting) {
                newPopulation.push(population[k]);
                break;
            }
        }
        if (newPopulation.length !== i + 1) {
            newPopulation.push(population[population.length - 1]);
        }
    }

    return newPopulation;
}

export class GeneticAlgorithm {
    constructor(private options: GeneticAlgorithm.Options) {
        if (this.options.populationSize % 2 !== 0) {
            throw new Error("Population size must be even");
        }
    }

    run(options: GeneticAlgorithm.RunOptions): GeneticAlgorithm.Result {
        let population = createPopulation(
            this.options.populationSize,
            this.options.genotypeSize
        );

        let best:
            | {
                  population: Population;
                  populationScore: number;
                  occurrences: number;
                  individualsScore: number[];
                  bestIndividual: Individual;
                  bestIndividualScore: number;
              }
            | undefined;
        let iteration = 1;

        while (true) {
            population = options.modifyPopulationBeforeScoring
                ? options.modifyPopulationBeforeScoring(population)
                : population;

            const individualsScore = population.map((individual) =>
                individual.score(this.options.fittingFunction)
            );
            const bestIndividualScore = Math.max(...individualsScore);
            const bestIndividual =
                population[individualsScore.indexOf(bestIndividualScore)];
            const populationScore = individualsScore.reduce((a, b) => a + b, 0);

            if (!best || populationScore > best.populationScore) {
                best = {
                    population,
                    populationScore,
                    individualsScore,
                    occurrences: 0,
                    bestIndividual,
                    bestIndividualScore,
                };
            }

            if (populationScore === best.populationScore) {
                if (bestIndividualScore > best.bestIndividualScore) {
                    best = {
                        population,
                        populationScore,
                        individualsScore,
                        occurrences: best.occurrences,
                        bestIndividual,
                        bestIndividualScore,
                    };
                }

                best.occurrences++;
            }

            if (options.afterIteration) {
                options.afterIteration(iteration, {
                    population,
                    individualsScore,
                    best: bestIndividual,
                    score: populationScore,
                });
            }

            if (
                best.occurrences >= options.maxBestOccurrences ||
                iteration >= options.maxIterations
            ) {
                break;
            }

            // 1. selection
            let newPopulation: Population = selection(population, individualsScore, populationScore);

            // 2. crossing
            newPopulation = flatten(
                chunk(population, 2).map(([parent1, parent2]) => {
                    if (!parent2) return [parent1];

                    if (Math.random() <= this.options.crossingProbability) {
                        return crossover(parent1, parent2);
                    } else {
                        return [parent1, parent2];
                    }
                })
            );

            // 3. mutation
            newPopulation = newPopulation.map((individual) => {
                if (Math.random() <= this.options.mutationProbability) {
                    return mutate(individual);
                } else {
                    return individual;
                }
            });

            population = newPopulation;
            iteration++;
        }

        const individualsScore = population.map((individual) => individual.score(this.options.fittingFunction));

        return {
            answer: best.bestIndividual.genotype,
            iterations: iteration,
            lastIteration: {
                population,
                individualsScore: individualsScore,
                best: best.bestIndividual,
                score: individualsScore.reduce((a, b) => a + b, 0),
            },
        };
    }
}