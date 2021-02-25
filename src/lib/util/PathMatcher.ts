import {AdvancedTargetPattern, BasicTargetPattern, TargetPattern, TargetMatchingFunction} from '../../types'
import picomatch = require('picomatch');
import normalize = require('normalize-path');

type SortedPatterns = {
	inclusionPatterns: BasicTargetPattern[];
	exclusionPatterns: BasicTargetPattern[];
	advancedPatterns: AdvancedTargetPattern[];
};

export class PathMatcher {
	private readonly matcher: TargetMatchingFunction;

	/**
	 *
	 * @param {TargetPattern[]} patterns - An array of TargetPatterns against which paths can be compared. Patterns can
	 *                                     be positive or negative strings (i.e. don't/do start with `!`), or objects
	 *                                     describing complex patterns.
	 */
	constructor(patterns: TargetPattern[]) {
		this.matcher = this.generateMatchingFunction(patterns);
	}


	private generateMatchingFunction(patterns: TargetPattern[]): TargetMatchingFunction {
		const {inclusionPatterns, exclusionPatterns, advancedPatterns} = this.sortPatterns(patterns);

		const inclusionMatcher = picomatch(inclusionPatterns);
		const exclusionMatcher = picomatch(exclusionPatterns);
		const advancedMatchers = advancedPatterns.map(ap => this.generateAdvancedMatcher(ap));

		return async (t: string): Promise<boolean> => {
			// Return true if ALL of the following are true:
			// -- All existing exclusion patterns are satisfied.
			// -- EITHER...
			//    -- There are neither inclusion patterns nor complex patterns.
			//    -- Any existing inclusion pattern is satisfied.
			//    -- Any existing complex pattern is satisfied.
			return (exclusionPatterns.length === 0 || !exclusionMatcher(t))
				&& ((!inclusionPatterns.length && !advancedPatterns.length)
					|| inclusionMatcher(t)
					|| (await Promise.all(advancedMatchers.map(am => am(t)))).includes(true)
				);
		}
	}

	private sortPatterns(patterns: TargetPattern[]): SortedPatterns {
		// We want to sort patterns into simple inclusion patterns, simple exclusion patterns, and advanced patterns.
		const inclusionPatterns: BasicTargetPattern[] = [];
		const exclusionPatterns: BasicTargetPattern[] = [];
		const advancedPatterns: AdvancedTargetPattern[] = [];

		patterns.forEach(p => {
			if (typeof p === 'string') {
				// Simple patterns need to be doctored to work with Picomatch, which matches patterns using a Logical OR
				// (i.e., it returns true if the target matches ANY provided pattern).
				//
				// First, the pattern needs to be normalized.
				const np = normalize(p);

				if (!np.startsWith('!')) {
					// Inclusion patterns (e.g., '**/*.js') indicate what a path is allowed to look like. We want files
					// that match ANY inclusion pattern, and since that's consistent with the Logical OR used by Picomatch,
					// we don't have to change the pattern at all.
					inclusionPatterns.push(np);
				} else {
					// Exclusion patterns (e.g., '!**/node_modules/**') indicate what a path is NOT allowed to look like.
					// We want to exclude files UNLESS they match EVERY exclusion pattern, which is a logical AND.
					// DeMorgan's Law states that (p && q) == !(!p || !q), so we can turn our AND into an OR by inverting
					// every exclusion pattern and negating the result of that matcher.
					exclusionPatterns.push(np.slice(1));
				}
			} else {
				// Currently, no use cases require advanced patterns to act like exclusion patterns, so we'll put them
				// all into one array and treat them like supplemental inclusion patterns. If there ever arises a need
				// to do differently, this implementation can freely change.
				advancedPatterns.push(p);
			}
		});

		return {
			inclusionPatterns: inclusionPatterns,
			exclusionPatterns: exclusionPatterns,
			advancedPatterns: advancedPatterns
		};
	}

	private generateAdvancedMatcher(pattern: AdvancedTargetPattern): TargetMatchingFunction {
		const baseMatcher = this.generateMatchingFunction(pattern.basePatterns);

		return async (t: string): Promise<boolean> => {
			return await baseMatcher(t) && await pattern.advancedMatcher(t);
		};
	}

	/**
	 * Resolves to the subset of the provided paths matching ANY of this matcher's positive patterns AND ALL of its negative patterns.
	 * @param {string[]} targets - An array of paths
	 * @returns {Promise<string[]>} - The subset of the target strings that match the provided patterns.
	 */
	public async filterPathsByPatterns(targets: string[]): Promise<string[]> {
		const matchResults: boolean[] = await Promise.all(targets.map(t => this.matcher(normalize(t))));

		const filteredTargets: string[] = [];
		matchResults.forEach((r: boolean, idx: number) => {
			if (r) {
				filteredTargets.push(targets[idx]);
			}
		});
		return filteredTargets;
	}

	/**
	 * Resolves to true if the provided target string matches ANY of this matcher's positive patterns AND ALL of its negative patterns.
	 * @param {string} target - A path.
	 * @returns {Promise<boolean>}
	 */
	public async pathMatchesPatterns(target: string): Promise<boolean> {
		return this.matcher(normalize(target));
	}
}
