/*!
 * D2 Animations Library v1.0
 * https://github.com/Fa-b/D2Animations
 * 
 * A js .dcc file parser to recolor D2 animations and/or export animation frames
 * 
 * Authors: Fa-b
 * Date: 2020/03/19
 */
 
Vue.component('sprite-sheet', {
    props: ['file'],
    template: `
    <div class="blog-post">
        <h2>{{ file.name }}</h2>
        <select v-on:change="selectComposition">
            <!--<option disabled selected value> -- select palette -- </option>-->
            <option v-for="(palette, index) in palettes" v-bind:value="palette.map"  v-bind:key="palette.key" v-bind:name="palette.name">
                {{ palette.name }}
            </option>
            <option v-for="(palette, index) in compositions" v-bind:value="palette.map"  v-bind:key="palette.key" v-bind:name="palette.name">
                {{ palette.name }}
            </option>
        </select>
        <button v-on:click="$emit('remove-sprite', file)">
            Remove
        </button>
        <div v-for="direction in directions">
            <img v-bind:style="direction.image.style" v-bind:src="direction.image.src" v-bind:ref="direction.image.id">
        </div>
    </div>`,
    data: function() {
        /*
            File Header:
                uint32_t version
                uint32_t unknown1
                uint32_t unknown2
                char[] termination[4]
                uint32_t directions
                uint32_t frames_per_dir
                
            Frame Pointer: (points to Frame Header, so +32 bytes for data)
                uint32_t[] file_offset[directions * frames_per_dir]
                
            Frame Header:
                uint32_t flip
                uint32_t width
                uint32_t height
                uint32_t offset_x
                uint32_t offset_y
                uint32_t unknown
                uint32_t next_block
                uint32_t length
         */
        return { raw: [], fileheader: [], framepointer: [], frameheader: [], spriteData: [], palettes: palettes, compositions: compositions, directions: [] }
    },
    methods: {
        str2DWORD: function(str) {
            var buf = new ArrayBuffer(str.length); // 2 bytes for each char
            var bufView = new Uint8Array(buf);
            for (var i=0, strLen=str.length; i < strLen; i++) {
                bufView[i] = str.charCodeAt(i);
            }
            return new DataView(buf).getUint32(0, true); // little Endian
        },
        
        selectComposition: function(e) {
            if(e) {
                var mapData = JSON.parse(e.target.value);
                //var mapData = JSON.parse(data.map);
                
                
                var imageData = [];
                
                this.spriteData;
                var canvas = document.createElement('canvas');
                var maxFramewidth = 0;
                var maxFrameheight = 0;
                for (var x = 0; x < this.fileheader[4]; x++) {
                    // Each direction
                    imageData.push([]);
                    this.spriteData.push([]);
                    for (var y = 0; y < this.fileheader[5]; y++) {
                        // Each Frame
                        imageData[x].push([]);
                        imageData[x][y] = document.createElement('canvas');
                        imageData[x][y].width = this.frameheader[x][y][1] + this.frameheader[x][y][3];
                         if(maxFramewidth < imageData[x][y].width)
                            maxFramewidth = imageData[x][y].width;
                        imageData[x][y].height = this.frameheader[x][y][2] + this.frameheader[x][y][4];
                        if(maxFrameheight < imageData[x][y].height)
                            maxFrameheight = imageData[x][y].height;
                        var graphics = imageData[x][y].getContext('2d');
                        this.spriteData[x].push([]);
                        this.spriteData[x][y] = graphics.getImageData(this.frameheader[x][y][3], this.frameheader[x][y][4], imageData[x][y].width, imageData[x][y].height);
                        var index1 = 0;
                        var index2 = 0;
                        var index3 = this.frameheader[x][y][2] - 1;
                        var index4 = 0
                        while (index4 < this.frameheader[x][y][7]) {
                            index4 += 1
                            var num1 = this.raw[x][y][index1];
                            index1 += 1;
                            if (num1 == 128) {
                                index2 = 0;
                                index3 -= 1;
                            } else if ((num1 & 128) == 128) {
                                index2 += (num1 & 127);
                            } else {
                                var index5 = 0
                                while (index5 < num1) {
                                    index5 += 1
                                    var num2 = this.raw[x][y][index1];
                                    index1 += 1;
                                    index4 += 1;
                                    var idx = (index3*imageData[x][y].width + index2) * 4;
                                    this.spriteData[x][y].data[idx++] = mapData[num2][0];
                                    this.spriteData[x][y].data[idx++] = mapData[num2][1];
                                    this.spriteData[x][y].data[idx++] = mapData[num2][2];
                                    this.spriteData[x][y].data[idx] = 255;
                                    graphics.putImageData(this.spriteData[x][y], this.frameheader[x][y][3], this.frameheader[x][y][4]);
                                    index2 += 1;
                                }
                            }
                        }
                    }
                }
                
                var windowWidth = Math.trunc(document.body.clientWidth * 0.7);
                
                
                this.directions.length = 0;
                
                for (let row = 0; row < this.fileheader[4]; row++) {
                    var canvas = document.createElement('canvas');
                    canvas.width = maxFramewidth * this.fileheader[5];
                    canvas.height = maxFrameheight;
                    var graphics = canvas.getContext('2d');
                    
                    var frames_cnt = this.fileheader[5];
                    
                    for (var col = 0; col < frames_cnt; col++) {
                        graphics.drawImage(imageData[row][col], col * maxFramewidth, 0);
                    }
                    
                    this.directions.push({
                        image: {
                            src: canvas.toDataURL(),
                            style: {
                                'max-width': windowWidth + "px"
                            },
                            id: "png_" + row
                        }
                    });
                }
                
                //this.file.image = /*"<img src:'" + */canvas.toDataURL()/* + "'>"*/;
                //this.$refs[this.file.name].src = this.file.image;
            }
        }
    },
    mounted() {
        var threaded = JSThread.create(async () => {
            var rawLength = this.file.data.length;
            this.raw = [];
            var idx = 0;
            var filesize = 6;
            for (var i = 0; i < filesize; i++) {
                this.fileheader.push(this.str2DWORD(this.file.data.slice(idx,idx+=4)));
            }
            filesize = this.fileheader[4] * this.fileheader[5];
            for (var i = 0; i < filesize; i++) {
                this.framepointer.push(this.str2DWORD(this.file.data.slice(idx,idx+=4)));
            }
            filesize = 8;
            for (var x = 0; x < this.fileheader[4]; x++) {
                // Each direction
                this.frameheader.push([]);
                this.raw.push([]);
                for (var y = 0; y < this.fileheader[5]; y++) {
                    // Each Frame
                    this.frameheader[x].push([]);
                    this.raw[x].push([]);
                    if((this.framepointer[x * y + y] != (idx + 3)) && (this.framepointer[x * y + y] != idx)) {
                        var term = this.file.data.slice(idx,idx+=3);
                        console.warn("Something is wrong:", this.file.name,"Direction/Frame:",x,"/",y,"Expected adress:",idx,"Given:",this.framepointer[x * y + y],"Data: ", term.charCodeAt(0).toString(16), term.charCodeAt(1).toString(16), term.charCodeAt(2).toString(16));
                    }
                    idx = this.framepointer[x * y + y];
                    for (var i = 0; i < filesize; i++) {
                        this.frameheader[x][y].push(this.str2DWORD(this.file.data.slice(idx,idx+=4)));
                    }
                    for (var j = 0; j < this.frameheader[x][y][7]; j++) {
                        this.raw[x][y].push(this.file.data.charCodeAt(idx++));
                    }
                    
                    eventHub.$emit('loading', { file: this.file, percent: this.fileheader[5] * x + y + 1, max: this.fileheader[5] * this.fileheader[4], info: "Unpacked direction " + x + " frame " + y });
                    await JSThread.yield();
                }
            }
            
            //console.log("File Header:",this.fileheader);
            //console.log("Frame Pointer:",this.framepointer);
            //console.log("Frame Header:",this.frameheader);	
            return "Finished";
        });
        
        threaded().then((msg) => {
            //console.log(msg);
            if(this.palettes[0])
                this.selectComposition({target:{value:this.palettes[0].map, name:this.palettes[0].name}});
            eventHub.$emit('finish', { file: this.file });
        }).catch((error) => {
            console.error(error);
        });
       
    },
    updated() {
        if(this.directions.length === 0 && this.palettes[0])
            this.selectComposition({target:{value:this.palettes[0].map, name:this.palettes[0].name}});
        /*else
            this.selectComposition(null);*/
    }
});
 
(function() {
    new Vue({
        el: '#spriteapp',
        mixins: [ eventHub ],
        data: {
            dc6_files: [ ]
        },
        methods: {
            removeSprite: function(file) {
                this.dc6_files.splice(this.dc6_files.indexOf(file),1);
            }
        },
        mounted() {
            this.eventHub.$on('new_spritesheet', data => {
                this.dc6_files.push(data);
            });
            
            this.eventHub.$on('remove_file', data => {
                var entry = this.dc6_files.find((file) => file.hash === data.hash);
                if(entry) {
                    this.removeSprite(entry);
                }
            });
        }
        
        
    });
})();