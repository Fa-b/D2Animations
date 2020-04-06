/*!
 * D2 Animations Library v1.0
 * https://github.com/Fa-b/D2Animations
 * 
 * A js .dcc file parser to recolor D2 animations and/or export animation frames
 * 
 * Authors: Fa-b
 * Date: 2020/03/19
 */
 
Vue.component('color-map', {
    props: ['file'],
    template: `
    <div class="blog-post">
        <h2>{{ file.name }}</h2>
        <select v-on:change="selectPalette" ref="sel">
            <option v-for="(palette, index) in palettes" v-bind:value="palette.map" v-bind:key="palette.key" v-bind:name="palette.name">
                {{ palette.name }}
            </option>
        </select>
        <button v-on:click="$emit('remove-map', file)">
            Remove
        </button>
        <div>
            <img v-bind:src="image">
        </div>
    </div>`,
    data: function() {
        return { raw: [], palettes: palettes, image: "" }
    },
    methods: {
        selectPalette: function(e) {
            if(e) {
                var mapData = JSON.parse(e.target.value);

                var width = Math.floor(this.raw.length);
                var height = Math.floor(Math.sqrt(this.raw[0].length));
                //console.log("Rectangle of:",width,'x',height);
                
                var windowWidth = Math.floor(document.body.clientWidth * 0.7);
                
                var canvas = document.createElement('canvas');
                canvas.width = windowWidth;
                canvas.height = 32*width+width;
                var graphics = canvas.getContext('2d');
                graphics.textAlign = "left";
                graphics.font = "bold 1.5em Arial";
                graphics.fillStyle = "rgba(10, 10, 10, 1)";
                
                for (var x = 0; x < width; x++) {
                    var grid = new Grid(windowWidth - 100,32,256,1);
                    var newMap = [];
                    idx = 0;
                    for (var i = 0; i < 1; i++) {
                        for (var j = 0; j < 256; j++) {
                            newMap.push(mapData[this.raw[x][idx]]);
                            grid.paintCell(0, j, newMap[idx]);
                            idx++;
                        }
                    }
                    graphics.drawImage(grid.drawGrid(0,0), 0, x*32+x);
                    graphics.fillText("<= " + x, grid.width + 20, x*32+x + 20);
                    
                    compositions.push({ hash: this.file.hash, key: String(e.target.name + ">" + this.file.name + "_" + x), name: e.target.name + ">" + this.file.name + "_" + x, map: JSON.stringify(newMap) });
                }
                this.image = canvas.toDataURL();
                //this.$refs[this.file.name].src = this.file.image;
            }
        }
    },
    mounted() {
        var threaded = JSThread.create(async () => {
            var rawLength = this.file.data.length / 256;
            for (var i = 0; i < rawLength; i++) {
                this.raw.push(new Uint8Array(new ArrayBuffer(256)));
                for (var j = 0; j < 256; j++) {
                    this.raw[i][j] = this.file.data.charCodeAt(i * 256 + j);
                }
                eventHub.$emit('loading', { file: this.file, percent: i + 1, max: rawLength, info: "Shifted map " + i + " / " + rawLength });
                await JSThread.yield();
            }
            
            return "Finished";
        });
        
        threaded().then((msg) => {
            //console.log(msg);
            if(this.palettes[0])
                this.selectPalette({target:{value:this.palettes[0].map, name:this.palettes[0].name}});
            eventHub.$emit('finish', { file: this.file });
        }).catch((error) => {
            console.error(error);
        });
    },
    updated() {
        if(this.image === "" && this.palettes[0])
            this.selectPalette({target:{value:this.palettes[0].map, name:this.palettes[0].name}});
        /*else
            this.selectPalette(null);*/
    }
});
 
(function() {
    new Vue({
        el: '#mapapp',
        mixins: [ eventHub ],
        data: {
            map_files: [ ]
        },
        methods: {
            removeMap: function(file) {
                var entries = compositions.filter(element => element.hash === file.hash);
                entries.forEach(entry => {
                    compositions.splice(compositions.indexOf(entry), 1);
                });
                this.map_files.splice(this.map_files.indexOf(file),1);
            }
        },
        mounted() {
            this.eventHub.$on('new_colormap', data => {
                this.map_files.push(data);
            });
            
            this.eventHub.$on('remove_file', data => {
                var entry = this.map_files.find((file) => file.hash === data.hash);
                if(entry)
                    this.removeMap(entry);
            });
        }
        
        
    });
})();