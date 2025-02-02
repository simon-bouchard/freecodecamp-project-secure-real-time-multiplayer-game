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

let player, collectible
socket.on('connect', () => {
	player = new Player({ x: 320, y: 240, score:0, id: socket.id })
	socket.emit('newPlayer', player);

	console.log('Player created')

	socket.emit('requestCollectible')

	update()
})

socket.on('newCollectible', (item) => {
	if (!collectible) {
		collectible = new Collectible(item.x, item.y)
	} else {
		collectible.x = item.x;
		collectible.y = item.y;
	}
});

let otherPlayers = []

socket.on('updatePlayers', (players) => {
	otherPlayers = players;
})



function drawSmileyFace(x, y, color, radius = 15) {

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
	ctx.strokeStyle = 'black';
    ctx.stroke(); 

    // Draw left eye
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(x - radius / 3, y - radius / 3, radius / 6, 0, Math.PI * 2);
    ctx.fill();

    // Draw right eye
    ctx.beginPath();
    ctx.arc(x + radius / 3, y - radius / 3, radius / 6, 0, Math.PI * 2);
    ctx.fill();

    // Draw smile
    ctx.beginPath();
    ctx.arc(x, y + radius / 6, radius / 2, 0, Math.PI);
    ctx.stroke();
}

function draw() {
	if (!player) {
		return
	}

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
	ctx.fillText(player.calculateRank(otherPlayers), canvas.width - padding, 30)

	//collectible
	if (collectible) {
		ctx.strokeStyle = '#FFD700'
		ctx.beginPath();
		ctx.arc(collectible.x, collectible.y, 7, 0, Math.PI * 2); 
		ctx.fillStyle = "#FFD700";
		ctx.fill();
	}

	//player
	drawSmileyFace(player.x, player.y, 'yellow');

	//other players
	otherPlayers.forEach(otherPlayer => {
		if (otherPlayer.id !== player.id) {
			drawSmileyFace(otherPlayer.x, otherPlayer.y, 'red');
		}
	})

	//score
	ctx.font = '15px Monospace';
	ctx.fillStyle = 'white';
	ctx.fillText(`Score: ${player.score}`, canvas.width - padding, 67);
}


function update() {
	if (!player || !collectible) {
		requestAnimationFrame(update);
		return
	}
	let moved = false 
	const speed = 5

	if ((keys['ArrowUp'] || keys['w']) && (player.y > 65)) {
		player.movePlayer('up', speed);
		moved = true;
	}
	if ((keys['ArrowDown'] || keys['s']) && (player.y < canvas.height - 20)) {
		player.movePlayer('down', speed);
		moved = true;
	}
	if ((keys['ArrowLeft'] || keys['a']) && player.x > 20) {
		player.movePlayer('left', speed);
		moved = true;
	}
	if ((keys['ArrowRight'] || keys['d']) && player.x < canvas.width - 20) {
		player.movePlayer('right', speed);
		moved = true;
	}

	let collision = player.collision(collectible);

	if (collision || moved) {
		socket.emit('updatePlayer', player);
		if (collision) {
			socket.emit('updateCollectible');
		}
	}

	draw();

	requestAnimationFrame(update);
}

