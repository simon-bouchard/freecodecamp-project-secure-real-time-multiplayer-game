import { io } from 'socket.io-client';
import { Keyboard } from './input.js';
import { drawFrame } from './render.js';
import { type GameSocket, GameSession } from './session.js';

const canvas = document.getElementById('game-window') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const socket: GameSocket = io();
const keyboard = new Keyboard(window);
const session = new GameSession(socket, () => keyboard.state);

function frame(now: number): void {
	session.update(now);
	drawFrame(ctx, session.view(now));
	requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
