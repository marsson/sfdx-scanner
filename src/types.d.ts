export type Rule = {
	engine: string;
	sourcepackage: string;
	name: string;
	description: string;
	categories: string[];
	rulesets: string[];
	languages: string[];
}

export type PathGroup = {
	engine: string;
	name: string;
	paths: string[];
}

export type Catalog = {
	rules: Rule[];
	categories: PathGroup[];
	rulesets: PathGroup[];
};

export type RuleEvent = {
	messageKey: string;
	args: string[];
	type: string;
	handler: string;
	verbose: boolean;
	time: number;
	internalLog?: string;
}
