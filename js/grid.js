function Grid(width, height, cols, rows) {
    this.width = width;
	this.height = height;
    this.pixel = {x: width/cols, y: height/rows};
    this.cols = cols;
    this.rows = rows;
    this.colorMap = (function() {
        var map = [];
        
        for (var i = 0; i < rows; i++) {
            map.push([]);
            for (var j = 0; j < cols; j++) {
                map[i].push([255,0,255]);
            }
            
        }
        
        return map;
    }).call();
    
    this.paintCell = function(x, y, rgb) {
        this.colorMap[x][y] = rgb;
    }
    
    this.repaint = function(map) {
        this.colorMap = map;
    }
    
    this.drawGrid = function(x, y) {		
		var canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        var graphics = canvas.getContext('2d');
        
		for (let i = 0; i < this.colorMap.length; i++) {
            for (let j = 0; j < this.colorMap[0].length; j++) {
                graphics.fillStyle = 'rgb('+this.colorMap[i][j][0]+','+this.colorMap[i][j][1]+','+this.colorMap[i][j][2]+')';
                graphics.fillRect(
                    (this.pixel.x * j) + x,
                    (this.pixel.y * i) + y,
                    this.pixel.x,
                    this.pixel.y
                );
            }
		}
        
        //console.log(this.colorMap);
		
		return canvas;
	}
}