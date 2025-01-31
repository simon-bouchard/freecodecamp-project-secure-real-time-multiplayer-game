class Player {
  	constructor({x = 320, y = 240, score = 0, id='new'} = {}) {

	  	this.x = x;
	  	this.y = y
	  	this.score = score;
	  	this.id = id
  	}

  	movePlayer(dir, speed) {

		if (dir === 'up') {
			this.y -= speed;
		}
		if (dir === 'down') {
			this.y += speed;
		}
		if (dir === 'left') {
			this.x -= speed;
		}
		if (dir === 'right') {
			this.x += speed;
		}
  	}

  	collision(item) {
		if (
			this.x < item.x + 20 &&
			this.x + 20 > item.x &&
			this.y < item.y + 20 &&
			this.y + 20 > item.y 
		) {
			this.score += item.value;
			console.log(this.score);
			item.reset();
		}
  	}

  	calculateRank(arr) {
		let currentRanking = 0;
		let totalPlayers = 0;

	  	for (var player=0; player < arr.length; player ++){
			if (arr[player].score > this.score) {
				currentRanking += 1;
			}
		}

		return `Rank: ${currentRanking}/${player}`
  	}
}

export default Player;
