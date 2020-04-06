/*!
 * D2 Animations Library v1.0
 * https://github.com/Fa-b/D2Animations
 * 
 * A js .dcc file parser to recolor D2 animations and/or export animation frames
 * 
 * Authors: Fa-b
 * Date: 2020/03/19
 */
 
Vue.component('palette', {
    props: ['file'],
    template: `
    <div class="blog-post">
      <h2>{{ file.name }}</h2>
      <button v-on:click="$emit('remove-palette', file)">
        Remove
      </button>
      <div>
        <img v-bind:src="file.image" v-bind:ref="file.name">
      </div>
    </div>`,
    data: function() {
        return { raw: [], map: [] }
    },
    mounted() {
        var threaded = JSThread.create(async () => {
            var rawLength = this.file.data.length;
            this.raw = new Uint8Array(new ArrayBuffer(rawLength));
            var j = 3;
            var idx = 0;
            for (var i = 0; i < rawLength; i++) {
                j--;
                this.raw[i] = this.file.data.charCodeAt(i);
                if (!this.map[idx])
                    this.map[idx] = []
                this.map[idx][j] = this.raw[i]
                if(j === 0){
                    j = 3;
                    idx++;
                }
            }
            
            square = Math.floor(Math.sqrt(this.map.length));
            //console.log("Square of:",square);
            
            var windowWidth = Math.floor(document.body.clientWidth * 0.7) - 100;
            
                    
            if(square > 0) {
                var grid = new Grid(windowWidth,32,256,1);
                idx = 0;
                for (var i = 0; i < 1; i++) {
                    for (var j = 0; j < 256; j++) {
                        grid.paintCell(i, j, this.map[idx]);
                        idx++;
                        eventHub.$emit('loading', { file: this.file, percent: j + 1, max: 256, info: "Painted cell " + j + " / " + 256 });
                        await JSThread.yield();
                    }
                }
                
                this.file.image = grid.drawGrid(0,0).toDataURL();
                this.$refs[this.file.name].src = this.file.image;
            }
            
            return "Finished";
        });
        
        threaded().then((msg) => {
            //console.log(msg);
            palettes.push({ hash: this.file.hash, key: this.file.name, name: this.file.name, map: JSON.stringify(this.map) });
            eventHub.$emit('finish', { file: this.file });
        }).catch((error) => {
            console.error(error);
        });        
    }
});
 
(function() {
    new Vue({
        el: '#paletteapp',
        mixins: [ eventHub ],
        data: {
            pal_files: [ ]
        },
        methods: {
            removePalette: function(file) {
                var entries = palettes.filter(element => element.hash === file.hash);
                entries.forEach(entry => {
                    palettes.splice(palettes.indexOf(entry), 1);
                });
                this.pal_files.splice(this.pal_files.indexOf(file),1);
            }
        },
        mounted() {
            this.eventHub.$on('new_palette', data => {
                this.pal_files.push(data);
            });
            
            this.eventHub.$on('remove_file', data => {
                var entry = this.pal_files.find((file) => file.hash === data.hash);
                if(entry)
                    this.removePalette(entry);
            });
        }        
        
    });
})();