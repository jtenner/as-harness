export type HarnessCoveragePointType = 1 | 2 | 3;

export interface HarnessCoveragePoint {
	id: number;
	file: string;
	line: number;
	column: number;
	coverType: HarnessCoveragePointType;
}

export interface HarnessCoveragePointEntry extends HarnessCoveragePoint {
	covered: boolean;
}

export interface HarnessCoverageFileOverview {
	id: string;
	uncovered: number;
	total: number;
	covered: string;
	types: {
		function: string;
		block: string;
		expression: string;
	};
}

export interface HarnessCoverageJSONFile {
	overview: HarnessCoverageFileOverview;
	[key: string]: HarnessCoverageFileOverview | HarnessCoveragePointEntry;
}

export interface HarnessCoverageJSONReport {
	[fileName: string]: HarnessCoverageJSONFile;
}

export interface HarnessCoverageSnapshot {
	points: Array<HarnessCoveragePoint>;
	coveredIds: Array<number>;
}
