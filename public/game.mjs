import Player from './Player.mjs';
import Collectible from './Collectible.mjs';

const socket = io();
const canvas = document.getElementById('game-window');
const ctx = canvas.getContext('2d');

let keys = {};

window.addEventListener('keydown', (event) => {
	keys[event.key] = true;
});

window.addEventListener('keyup', (event) => {
	keys[event.key] = false;
});

const player = new Player({ x: 320, y: 240, score:0, id: socket.id })
const collectible = new Collectible()

socket.emit('newPlayer', player);

socket.on('updatePlayers', (players) => {

})

function draw() {
	//background
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#232323';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	//outside rectangle
	ctx.strokeStyle = '#a1a1a1';
	ctx.lineWidth = 2;
	ctx.strokeRect(5, 50, canvas.width - 10, canvas.height - 55);

	//header
	ctx.font = '20px Monospace';
	ctx.fillStyle = 'white';

	const padding = 10

	ctx.textAlign = 'left';
	ctx.fillText(`Controls: WASD`, padding, 30)

	ctx.textAlign = 'center';
	ctx.fillText('Coin Race', canvas.width / 2, 30);

	ctx.textAlign = 'right';
	ctx.fillText(`Rank: ${1 / 1}`, canvas.width - padding, 30)

	//collectible
	ctx.strokeStyle = '#FFD700'
	ctx.beginPath();
	ctx.arc(collectible.x, collectible.y, 7, 0, Math.PI * 2); // (x, y, radius, startAngle, endAngle)
	ctx.fillStyle = "#FFD700";
	ctx.fill();

	//player
	ctx.fillStyle = 'green';
	ctx.fillRect(player.x, player.y, 20, 20)
}

const speed = 10

function update() {
	let moved = false 

	if ((keys['ArrowUp'] || keys['w']) && (player.y > 55)) {
		player.movePlayer('up', speed);
		moved = true;
	}
	if ((keys['ArrowDown'] || keys['s']) && (player.y < canvas.height - 20)) {
		player.movePlayer('down', speed);
		moved = true;
	}
	if ((keys['ArrowLeft'] || keys['a']) && player.x > 10) {
		player.movePlayer('left', speed);
		moved = true;
	}
	if ((keys['ArrowRight'] || keys['d']) && player.x < canvas.width - 20) {
		player.movePlayer('right', speed);
		moved = true;
	}

	if (player.collision(collectible)) {
		socket.emit('playerScore', {score: player.score});
	}

	if (moved) {
		socket.emit('playerMove', {x: player.x,  y: player.y});
	}

	draw();

	requestAnimationFrame(update);
}

update();
