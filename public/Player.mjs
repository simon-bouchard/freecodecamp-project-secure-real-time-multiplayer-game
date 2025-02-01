class Player {
  	constructor({x = 320, y = 240, score, id} = {}) {

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
		const playerRadius = 15
		const collectibleRadius = 7;

		const dx = this.x - item.x;
		const dy = this.y - item.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance < playerRadius + collectibleRadius) {
			this.score += item.value;
			item.reset();
			return true
		}
		return false
  	}

  	calculateRank(arr) {
		let currentRanking = 1;
		let totalPlayers = 0;

	  	for (let player=0; player < arr.length; player ++){
			if (arr[player].id === this.id) {
				continue
			}
			if (arr[player].score > this.score) {
				currentRanking += 1;
			}
		}
		return `Rank: ${currentRanking}/${arr.length}`
  	}
}

export default Player;
