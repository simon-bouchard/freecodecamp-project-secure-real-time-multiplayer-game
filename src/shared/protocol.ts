export interface Vec {
	x: number;
	y: number;
}

/** Which direction keys are currently held. */
export interface InputState {
	up: boolean;
	down: boolean;
	left: boolean;
	right: boolean;
}

/** One client tick of input; `seq` increases by one per message. */
export interface InputMessage {
	seq: number;
	input: InputState;
}

/** A player as the server sees it; `lastSeq` is the last input applied. */
export interface PlayerState {
	id: string;
	x: number;
	y: number;
	score: number;
	lastSeq: number;
}

export interface CoinState {
	id: number;
	x: number;
	y: number;
}

/** Full game state broadcast once per server tick; `time` is server ms. */
export interface Snapshot {
	tick: number;
	time: number;
	players: PlayerState[];
	coin: CoinState;
}

export interface ServerToClientEvents {
	snapshot: (snapshot: Snapshot) => void;
}

export interface ClientToServerEvents {
	input: (msg: InputMessage) => void;
}
