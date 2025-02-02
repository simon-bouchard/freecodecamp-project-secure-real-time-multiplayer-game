class Collectible {
	constructor({x, y, value=1, id=1} = {}) {

		if (!x && !y) {
			this.reset()
		} else {
			this.x = x
			this.y = y
		}

		this.value = value
		this.id = id

  	}

	reset() {
		const padding = 5;
		const gameArea = {
	    	x: 5,
		    y: 50,
			width: 640 - 10,
		    height: 480 - 55
		};
		

		this.x = Math.floor(Math.random() * (gameArea.width - padding * 2)) + gameArea.x + padding;
	    this.y = Math.floor(Math.random() * (gameArea.height - padding * 2)) + gameArea.y + padding;
	}

}

/*
  Note: Attempt to export this for use
  in server.js
*/
try {
  module.exports = Collectible;
} catch(e) {}

export default Collectible;
