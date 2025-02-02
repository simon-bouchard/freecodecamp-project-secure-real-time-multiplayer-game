require('dotenv').config();
const Collectible = require("./public/Collectible.mjs").default; 
const express = require('express');
const bodyParser = require('body-parser');
const expect = require('chai');
const http = require('http');
const socket = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');

const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner.js');

const app = express();
const server = http.createServer(app);
const io = socket(server);

app.use('/public', express.static(process.cwd() + '/public'));
app.use('/assets', express.static(process.cwd() + '/assets'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(helmet()); 

app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"], 
            styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"], 
            fontSrc: ["'self'", "https://fonts.gstatic.com"], 
            imgSrc: ["'self'", "data:"], 
            connectSrc: ["'self'", "ws:", "wss:"], 
            frameAncestors: ["'none'"], 
        },
    })
);

app.use(helmet.hidePoweredBy());

app.use((req, res, next) => {
    res.setHeader("X-Powered-By", "PHP 7.4.3"); 
    next();
});

app.use(helmet.noSniff());

app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    next();
});

//For FCC testing purposes and enables user to connect from outside the hosting platform
app.use(cors({origin: '*'})); 

// Index page (static HTML)
app.route('/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/index.html');
  }); 

//For FCC testing purposes
fccTestingRoutes(app);
    
// 404 Not Found Middleware
app.use(function(req, res, next) {
  res.status(404)
    .type('text')
    .send('Not Found');
});

let players = []

let collectible = new Collectible();

io.on("connection", (socket) => {
	console.log('A user connected:', socket.id);

	socket.on('newPlayer', (player) => {
		players.push(player);
		console.log(`New player added: ${player.id}`);
	    console.log(`Sending collectible to player: ${socket.id} -> (${collectible.x}, ${collectible.y})`);
		socket.emit('newCollectible', {x: collectible.x, y: collectible.y})
		io.emit('updatePlayers', players);
	})

	socket.on('requestCollectible', () => {
		socket.emit('newCollectible', {x: collectible.x, y: collectible.y})
	})

	socket.on('updatePlayer', (player) => {
		let playerIndex = players.findIndex( p => p.id === player.id)
		if (playerIndex !== -1) {
			players[playerIndex] = player
		}
		io.emit('updatePlayers', players);
	})

	socket.on('updateCollectible', () => {
		collectible.reset();
		io.emit('newCollectible', {x: collectible.x, y: collectible.y});
	})

	socket.on('disconnect', () => {
		console.log('User disconnected:', socket.id);
		players = players.filter( p => p.id !== socket.id);
		io.emit('updatePlayers', players)
	});
});

const portNum = process.env.PORT || 3000;

// Set up server and tests
server.listen(portNum, () => {
  console.log(`Listening on port ${portNum}`);
  if (process.env.NODE_ENV==='test') {
    console.log('Running Tests...');
    setTimeout(function () {
      try {
        runner.run();
      } catch (error) {
        console.log('Tests are not valid:');
        console.error(error);
      }
    }, 1500);
  }
});

module.exports = app; // For testing
