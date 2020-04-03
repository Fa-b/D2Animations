/*!
 * D2 Animations Library v1.0
 * https://github.com/Fa-b/D2Animations
 * 
 * A js .dcc file parser to recolor D2 animations and/or export animation frames
 * 
 * Authors: Fa-b
 * Date: 2020/03/19
 */
 
 const bit_codes = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 26, 28, 30, 32];
 const pixel_mask = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
 
Vue.component('animation', {
    props: ['file'],
    template: `
    <div class="blog-post">
        <h2>{{ file.name }}</h2>
        <select v-on:change="selectComposition">
            <option v-for="palette in palettes" v-bind:value="palette.map" v-bind:key="palette.id" v-bind:name="palette.name">
                {{ palette.name }}
            </option>
            <option v-for="palette in compositions" v-bind:value="palette.map" v-bind:key="palette.id" v-bind:name="palette.name">
                {{ palette.name }}
            </option>
        </select>
        <button v-on:click="$emit('remove-animation', file)">
            Remove
        </button>
        <div v-for="direction in directions">
            <div>
                <div style="display:inline-grid">
                    <div v-bind:style="direction.animation.style" v-bind:ref="direction.animation.id"></div>
                    <p style="grid-area:1/3/1/3">{{direction.animation.fpa}} FPA</p>
                    <p style="grid-area:2/3/2/3" v-bind:value="direction.animation.activeFrame">Frame: {{direction.animation.activeFrame}}</p>
                    <input type="range" min="4" max="255" v-bind:value="direction.animation.fpa" v-on:input="direction.animation.restart($event.target.value)" class="slider">
                </div>
                
            </div>
            <img v-bind:style="direction.image.style" v-bind:src="direction.image.src" v-bind:ref="direction.image.id">
        </div>
    </div>`,
    data: function() {
        /*
            File Header:
                char signature (read as 0x74)
                char version (read as 0x06)
                char nDirections (1,4,8,16,32)
                uint32_t nFrames (0 .. 256)
                uint32_t unknown (read as 1)
                uint32_t totalOutSize
                
            Direction Pointer: (points to Direction Header)
                uint32_t[] file_offset[nDirections * nFrames]
                
            Direction Header:
                uint32_t total_size
                30 bit register:
                                        CompressionFlags <29:28>:   compression_flags
                                        Variable0Bits <27:24>:      0bits_sizecode
                                        WidthBits <23:20>:          width_sizecode
                                        HeightBits <19:16>:         height_sizecode
                                        XOffsetBits <15:12>:        offset_x_sizecode
                                        YOffsetBits <11:8>:         offset_y_sizecode
                                        OptionalDataBits <7:4>:     optional_bytes_sizecode
                                        CodedBytesBits <3:0>:       length_sizecode
            Frame Header
                Variable0Bits       unused
                WidthBits           width
                HeightBits          height   
                XOffsetBits         offset_x
                YOffsetBits         offset_y
                OptionalDataBits    optional_bytes
                CodedBytesBits      length
                bit                 flip
                
            ** optional padding **
                
            Data Header (Compression Strategy)
                bit                 EqualCells
                bit                 PixelMask
                bit                 EncodingType
                bit                 RawPixelCodes
                bit[]               PixelValuesKey[256]
                
         */
        return { raw: [], fileheader: [], directionpointer: [], directionheader: [], directionbox: [], frameheader: [], framebox: [], dataheader: [], bitstream: [], frame_buffer: [], cell_buffer: [], pixelData: [], spriteData: [], palettes: palettes, compositions: compositions, directions: [] }
    },
    methods: {
        str2DWORD: function(str) {
            var buf = new ArrayBuffer(str.length);
            var bufView = new Uint8Array(buf);
            for (var i=0, strLen=str.length; i < strLen; i++) {
                bufView[i] = str.charCodeAt(i);
            }
            return new DataView(buf).getUint32(0, true); // little Endian
        },
        
        readBits: function(data, ptr, bits, signed) {
            var b = 0;
            var dest_bit = 0;
            var dest_byte = 0;

            var buf = new ArrayBuffer(4);

            var retVal = new Uint8Array(buf);
            
            if (bits == 0)
                return 0;

            if (bits < 0)
                return 0;

            if (bits > 32)
                return 0;

            for (b = 0; b < bits; b++) {
                var valByte = data.charCodeAt(ptr.cur_byte);
                if (valByte & (1 << ptr.cur_bit))
                    retVal[dest_byte] |= (1 << dest_bit);

                dest_bit++;
                if (dest_bit >= 8) {
                    dest_bit = 0;
                    dest_byte++;
                }

                ptr.cur_bit++;
                if (ptr.cur_bit >= 8) {
                    ptr.cur_bit = 0;
                    ptr.cur_byte++;
                }
            }
            
            var highbit = bits;
            var highbyte = 0;
            
            while (highbit > 8) {
                highbit -= 8;
                highbyte++;
                
            };

            // signed value handle
            if (signed && (retVal[highbyte] & (1 << (highbit - 1)))) {
                // negative : negate result
                retVal[highbyte++] |= ~((1 << highbit) - 1);
                for (var i = highbyte; i < 4; i++) {
                    retVal[i] |= 255;
                }
                return new DataView(buf).getInt32(0, true);
            }

            return new DataView(buf).getUint32(0, true);
        },
        
        measureBox: function(width, height, offset_x, offset_y, flip) {
            return {
                xmin: offset_x,
                xmax: offset_x + width,
                ymin: flip?offset_y:(offset_y - height),
                ymax: flip?(offset_y - height):offset_y,
                width: width,
                height: flip?-height:height,
                cells: []
            };
        },
        
        decodePixelData: function(direction, frame) {
            var cell_w  = this.framebox[direction][frame].cells[0].length;
            var cell_h  = this.framebox[direction][frame].cells.length;
            var cell0_x = Math.trunc((this.framebox[direction][frame].xmin - this.directionbox[direction].xmin) / 4);
            var cell0_y = Math.trunc((this.framebox[direction][frame].ymin - this.directionbox[direction].ymin) / 4);
            
            var ec = 0;
            var pm = 0x0;
            var et = 0;
            var rp = [0, 0, 0, 0];
            var pd = 0x0;
            
            for (var row = 0; row < cell_h; row++) {
                var cur_cell_y = cell0_y + row;
                for (var col = 0; col < cell_w; col++) {
                    var cur_cell_x = cell0_x + col;
                    var cur_cell = cur_cell_x + (cur_cell_y * this.directionbox[direction].cells[0].length);
                    
                    // check if this cell need a new entry in pixel_buffer
                    var next_cell = false;
                    if(this.cell_buffer[cur_cell]) {
                        if(this.bitstream[direction][0].stream.length > 0) {
                            // EqualCells
                            ec = this.bitstream[direction][0].stream[this.bitstream[direction][0].idx++];
                        }
                        
                        if(ec == 0) {
                            // PixelMask
                            pm = this.bitstream[direction][1].stream[this.bitstream[direction][1].idx++];
                        } else {
                            next_cell = true;
                        }
                    } else {
                        pm = 0xF;
                    }
                    
                    if(!next_cell) {
                        rp = [0, 0, 0, 0];
                        var lp = 0;
                        var cnt = pixel_mask[pm];
                        if((cnt > 0) && this.bitstream[direction][2].stream.length > 0) {
                            // EncodingType
                            et = this.bitstream[direction][2].stream[this.bitstream[direction][2].idx++];
                        }
                        
                        var dp = 0;
                        for (var i = 0; i < cnt; i++) {
                            if(et > 0) {
                                // RawPixel
                                rp[i] = this.bitstream[direction][3].stream[this.bitstream[direction][3].idx++];
                            } else {
                                pd = 0xF;
                                rp[i] = lp;
                                while(pd == 0xF) {
                                    // PixelCodeAndDisplacement
                                    pd = this.bitstream[direction][4].stream[this.bitstream[direction][4].idx++];
                                    rp[i] += pd;
                                }
                            }
                            
                            if(rp[i] == lp) {
                                rp[i] = 0;
                                break; // discard this pixel and leave the cell
                            }
                            lp = rp[i];
                            dp++;
                        }
                        
                        var old_entry = this.cell_buffer[cur_cell];
                        var tmp = [0, 0, 0, 0];
                        var cur_idx  = dp - 1; // we'll "pop" them
                        for (var i = 0; i < 4; i++) {
                            if(pm & (1 << i)) {
                                if(cur_idx >= 0) {
                                    tmp[i] = rp[cur_idx--];
                                }
                            } else {
                                tmp[i] = old_entry[i];
                            }
                        }
                        this.cell_buffer[cur_cell] = tmp;
                        this.pixelData.push({
                            val: tmp,
                            frame: frame,
                            row: row,
                            col: col,
                        });
                        
                    }
                }
            }
        },
        
        create2dArray: (rows, columns) => [...Array(rows).keys()].map(i => Array(columns)),
        
        blit: function(source, destination, x_source, y_source, x_dest, y_dest, width, height) {
            for (var row = y_source; row < (y_source + height); row++) {
                for (var col = x_source; col < (x_source + width); col++) {
                    if((destination.width >= (x_dest + col - x_source)) && (destination.height >= (y_dest + row - y_source)) && (source.width >= col) && (source.height >= row))
                        try {
                            destination.data[y_dest + row - y_source][x_dest + col - x_source] = source.data[row][col];
                        } catch(e) {
                            console.error(this.file.name, "Failed copying cell:", source.data[row][col], "[row,col] [" + row + "," + col + "] to destination [row,col] [" + (y_dest + row - y_source) + "," + (x_dest + col - x_source) + "]:", destination.data, e);
                        }
                        
                }
            }
        },
        
        clear_to_color: function(source, color) {
            for (var row = 0; row < source.height; row++) {
                for (var col = 0; col < source.width; col++) {
                    source.data[row][col] = color;
                }
            }            
        },
        
        putpixel: function(source, x, y, color) {
            source.data[y][x] = color;        
        },
        
        buildFrame: function(direction, frame) {
            var f_cell_w  = this.framebox[direction][frame].cells[0].length;
            var f_cell_h  = this.framebox[direction][frame].cells.length;
            var x0 = this.framebox[direction][frame].xmin - this.directionbox[direction].xmin;
            var y0 = this.framebox[direction][frame].ymin - this.directionbox[direction].ymin;
            
            var cell = {
                width: 0,
                height: 0,
                data: []
            };

            for (var row = 0; row < f_cell_h; row++) {
                x0 = this.framebox[direction][frame].xmin - this.directionbox[direction].xmin;
                cell.height = this.framebox[direction][frame].cells[row][0].h;

                var buf_row = Math.trunc(y0 / 4);
                
                for (var col = 0; col < f_cell_w; col++) {
                    var buf_col = Math.trunc(x0 / 4);
                    
                    cell.width = this.framebox[direction][frame].cells[row][col].w;
                    try {
                        cell.data = this.create2dArray(cell.height, cell.width);
                    } catch(e) {
                        
                        console.error(this.file.name, "Invalid Dimensions (x,y): (" + cell.width + "," + cell.height + ")",
                                        "In [Direction,Frame,Row,Column]:", "[" + direction + "," + frame + "," + row + "," + col + "]", e);
                    }
                    
                    if(this.pixelData.length == 0 || (this.pixelData[0].frame != frame) || ((this.pixelData[0].row != row) || (this.pixelData[0].col != col))) {
                        // this buffer cell have an equalcell bit set to 1
                        // so either copy the frame cell or clear it
                        if ((cell.width != this.directionbox[direction].cells[buf_row][buf_col].buffer.width) || (cell.height != this.directionbox[direction].cells[buf_row][buf_col].buffer.height)) {
                            // different sizes
                            // Do nothing.. all transparent pixels
                            this.clear_to_color(cell,0);
                        } else {
                            // same sizes
                            // copy the old frame cell into its new position
                            this.blit(this.directionbox[direction].cells[buf_row][buf_col].buffer, cell, 0, 0, 0, 0, cell.width, cell.height);
                            // copy it again, into the final frame bitmap
                            this.blit(cell, this.spriteData[direction][frame], 0, 0, x0, y0, cell.width, cell.height);
                        }
                    } else {
                        // fill the frame cell with pixels
                        if (this.pixelData[0].val[0] == this.pixelData[0].val[1]) {
                           // fill FRAME cell to color val[0]
                           this.clear_to_color(cell, this.pixelData[0].val[0]);
                        }
                        else
                        {
                            var nb_bit = 0;
                            if (this.pixelData[0].val[1] == this.pixelData[0].val[2])
                                nb_bit = 1;
                            else {
                                nb_bit = 2;
                            }

                            // fill FRAME cell with pixels
                            for (var y = 0; y < cell.height; y++) {
                                for (var x = 0; x < cell.width; x++) {
                                    // PixelCodeAndDisplacement
                                    var pix = this.readBits(this.file.data, this.bitstream[direction][4].ptr, nb_bit, false);
                                    this.putpixel(cell, x, y, this.pixelData[0].val[pix]);
                                }
                            }
                        }

                        // copy the frame cell into the frame bitmap
                        this.blit(cell, this.spriteData[direction][frame], 0, 0, x0, y0, cell.width, cell.height);

                        // next pixelbuffer entry
                        this.pixelData.splice(0,1);
                    }

                    // for the buffer cell that was used by this frame cell,
                    // save the width & size of the current frame cell
                    // (needed for further tests about equalcell)
                   Object.assign(this.directionbox[direction].cells[buf_row][buf_col].buffer, cell);
                    
                    x0 += cell.width;
                }
                
                y0 += cell.height;
            }    
        },
        
        selectComposition: function(e) {
            if(e) {
                var mapData = JSON.parse(e.target.value);
                //var mapData = JSON.parse(data.map);
                
                var imageData = [];
                
                var canvas = document.createElement('canvas');
                var maxFramewidth = 0;
                var maxFrameheight = 0;
                for (var x = 0; x < this.fileheader[2]; x++) {
                    // Each direction
                    imageData.push([]);
                    for (var y = 0; y < this.fileheader[3]; y++) {
                        // Each Frame
                        imageData[x].push([]);
                        imageData[x][y] = document.createElement('canvas');
                        imageData[x][y].width = this.spriteData[x][y].width;
                         if(maxFramewidth < imageData[x][y].width)
                            maxFramewidth = imageData[x][y].width;
                        imageData[x][y].height = this.spriteData[x][y].height;
                        if(maxFrameheight < imageData[x][y].height)
                            maxFrameheight = imageData[x][y].height;
                        var graphics = imageData[x][y].getContext('2d');
                        var idx = 0;
                        var code = undefined;
                        var imgData = graphics.getImageData(0, 0, this.spriteData[x][y].width, this.spriteData[x][y].height);
                        for (var row = 0; row < imageData[x][y].height; row++) {
                            for (var col = 0; col < this.spriteData[x][y].width; col++) {
                                code = this.spriteData[x][y].data[row][col];
                                if(code > 0) {
                                    imgData.data[idx++] = mapData[code][0];
                                    imgData.data[idx++] = mapData[code][1];
                                    imgData.data[idx++] = mapData[code][2];
                                    imgData.data[idx++] = 255;
                                } else {
                                    idx += 4;
                                }
                                    
                            }
                        }
                        
                        graphics.putImageData(imgData, 0, 0);
                    }
                }
                
                var windowWidth = Math.trunc(document.body.clientWidth * 0.7);
                
                this.directions.forEach((direction) => {
                    //clearInterval(direction.animation.interval);
                    direction.animation.stop();
                    direction = null;
                });
                
                this.directions.length = 0;
                
                for (let row = 0; row < this.fileheader[2]; row++) {
                    var anim = document.createElement('canvas');
                    anim.width = maxFramewidth * this.fileheader[3];
                    anim.height = maxFrameheight;
                    var graphics = anim.getContext('2d');
                    
                    var frames_cnt = this.fileheader[3];
                    
                    for (var col = 0; col < frames_cnt; col++) {
                        graphics.drawImage(imageData[row][col], col * maxFramewidth, 0);
                    }

                    this.directions.push({
                        image: {
                            src: anim.toDataURL(),
                            style: {
                                'max-width': windowWidth + "px"
                            },
                            id: "png_" + row
                        },
                        animation: {
                            style: {
                                'background': "#000000 url(" + anim.toDataURL() + ")",
                                'width': maxFramewidth + "px",
                                'height': maxFrameheight + "px",
                                'grid-area': "1/1/3/3"
                            },
                            id: "anim_" + row,
                            fpa: frames_cnt,
                            activeFrame: 0,
                            start: (self, frame_list) => {
                                var position = 0;
                                return setInterval(() => {
                                    if(position >= frame_list.length)
                                        position = 0;
                                    self.activeFrame = frame_list[position];
                                    $(this.$refs["anim_" + row]).css('backgroundPosition', -(frame_list[position++]*maxFramewidth) + 'px 0px');
                                }, 40);
                            },
                            stop: function() {
                                clearInterval(this.interval);
                            },
                            restart: function(fpa) {
                                this.fpa = fpa;
                                clearInterval(this.interval);
                                var frame_list = [];
                                for (var i = 0; i < this.fpa; i++) {
                                    frame_list.push(Math.trunc((i * frames_cnt / (this.fpa - 1))));
                                }
								frame_list[frame_list.length - 1]--;
                                this.interval = this.start(this, frame_list);
                            }
                        }
                    });
                    
                    this.directions.forEach((direction) => {
                        direction.animation.restart(frames_cnt);
                    });
                }     
                
                imageData = null;
            }
        }
    },
    mounted() {
        var rawLength = this.file.data.length;
        this.raw = [];
        var idx = 0;
        var ptr = {
                cur_byte: idx,
                cur_bit: 0
            };
        
        // File Header: signature, version, directions, frames, unknown, file_size
        this.fileheader.push(this.file.data.charCodeAt(idx++));
        this.fileheader.push(this.file.data.charCodeAt(idx++));
        this.fileheader.push(this.file.data.charCodeAt(idx++));
        var filesize = 3;
        for (var i = 0; i < filesize; i++) {
            this.fileheader.push(this.str2DWORD(this.file.data.slice(idx,idx+=4)));
        }
        
        filesize = this.fileheader[2];
        for (var i = 0; i < filesize; i++) {
            this.directionpointer.push(this.str2DWORD(this.file.data.slice(idx,idx+=4)));
        }

        // Direction Header: total_size, compression_flags, 0bits_sizecode, width_sizecode, height_sizecode, offset_x_sizecode, offset_y_sizecode, optional_bytes_sizecode, length_sizecode
        for (var x = 0; x < this.fileheader[2]; x++) {
            // Each direction
            this.directionheader.push([]);
            this.directionbox.push({
                xmin: 2147483647,
                xmax: -2147483648,
                ymin: 2147483647,
                ymax: -2147483648,
                width: 0,
                height: 0,
                cells: []
            });
            this.frameheader.push([]);
            this.framebox.push([]);
            this.dataheader.push([0,0,0,0,[],0]);
            this.bitstream.push([]);
            this.spriteData.push([]);
            this.raw.push([]);
            if(this.directionpointer[x] != idx) {
                console.warn(JSON.stringify(ptr));
                console.warn("Something is wrong:", this.file.name,"Direction:",x,"Expected adress:",this.directionpointer[x],"Given:",idx);
            }

            ptr = {
                cur_byte: this.directionpointer[x],
                cur_bit: 0
            };

            this.directionheader[x].push(this.readBits(this.file.data, ptr, 32, false));
            this.directionheader[x].push(this.readBits(this.file.data, ptr, 2, false));
            this.directionheader[x].push(bit_codes[this.readBits(this.file.data, ptr, 4, false)]);
            this.directionheader[x].push(bit_codes[this.readBits(this.file.data, ptr, 4, false)]);
            this.directionheader[x].push(bit_codes[this.readBits(this.file.data, ptr, 4, false)]);
            this.directionheader[x].push(bit_codes[this.readBits(this.file.data, ptr, 4, false)]);
            this.directionheader[x].push(bit_codes[this.readBits(this.file.data, ptr, 4, false)]);
            this.directionheader[x].push(bit_codes[this.readBits(this.file.data, ptr, 4, false)]);
            this.directionheader[x].push(bit_codes[this.readBits(this.file.data, ptr, 4, false)]);
            
            var optionalData = 0;
            
            // Frame Header: unused, width, height, offset_x, offset_y, optional_bytes, length, flip
            for (var y = 0; y < this.fileheader[3]; y++) {
                // Each Frame
                this.frameheader[x].push([]);
                this.raw[x].push([]);
                
                this.frameheader[x][y].push(this.readBits(this.file.data, ptr, this.directionheader[x][2], false));
                this.frameheader[x][y].push(this.readBits(this.file.data, ptr, this.directionheader[x][3], false));
                this.frameheader[x][y].push(this.readBits(this.file.data, ptr, this.directionheader[x][4], false));
                this.frameheader[x][y].push(this.readBits(this.file.data, ptr, this.directionheader[x][5], true));
                this.frameheader[x][y].push(this.readBits(this.file.data, ptr, this.directionheader[x][6], true));
                this.frameheader[x][y].push(this.readBits(this.file.data, ptr, this.directionheader[x][7], false));
                this.frameheader[x][y].push(this.readBits(this.file.data, ptr, this.directionheader[x][8], false));
                this.frameheader[x][y].push(this.readBits(this.file.data, ptr, 1, false));
                
                optionalData += this.frameheader[x][y][5];
                
                this.framebox[x].push(this.measureBox(  this.frameheader[x][y][1],
                                                        this.frameheader[x][y][2],
                                                        this.frameheader[x][y][3],
                                                        this.frameheader[x][y][4],
                                                        this.frameheader[x][y][7]));
                
                if (this.framebox[x][y].xmin < this.directionbox[x].xmin)
                    this.directionbox[x].xmin = this.framebox[x][y].xmin;

                if (this.framebox[x][y].ymin < this.directionbox[x].ymin)
                    this.directionbox[x].ymin = this.framebox[x][y].ymin;

                if (this.framebox[x][y].xmax > this.directionbox[x].xmax)
                    this.directionbox[x].xmax = this.framebox[x][y].xmax;

                if (this.framebox[x][y].ymax > this.directionbox[x].ymax)
                    this.directionbox[x].ymax = this.framebox[x][y].ymax;
            }
            
            // When there is optional data we have to pad our stream up to the next byte boundary and apply an offset according to the sum of all optionalData bytes
            if(optionalData > 0) {
                if(ptr.cur_bit != 0) {
                    ptr.cur_bit = 0;
                    ptr.cur_byte += optionalData;
                }
            }
            
            this.directionbox[x].width  = this.directionbox[x].xmax - this.directionbox[x].xmin + 1;
            this.directionbox[x].height = this.directionbox[x].ymax - this.directionbox[x].ymin + 1;
            
            /** Start Prepare Direction Buffer Cell's **/
            
            var fract_width = Math.trunc((this.directionbox[x].width - 1) / 4);
            var rest_width = this.directionbox[x].width % 4;   // if 0, append width 4 at end
            var fract_height = Math.trunc((this.directionbox[x].height - 1) / 4);
            var rest_height = this.directionbox[x].height % 4; // if 0, append height 4 at end
            for (var i = 0; i < (fract_height + 1); i++) {
                this.directionbox[x].cells.push([]);
                for (var j = 0; j < fract_width; j++) {
                    this.directionbox[x].cells[this.directionbox[x].cells.length-1].push({
                        width: 4,
                        height: (i==fract_height && rest_height)?rest_height:4,
                        buffer: {
                            width: 0,//4,
                            height: 0,//(i==fract_height && rest_height)?rest_height:4,
                            data: []
                        }
                    });
                }
                this.directionbox[x].cells[this.directionbox[x].cells.length-1].push({
                    width: rest_width?rest_width:4,
                    height: (i==fract_height && rest_height)?rest_height:4,
                    buffer: {
                        width: 0,
                        height: 0,
                        data: []
                    }
                });
            }
            
            /** End Prepare Direction Buffer Cell's **/
            
            // Compression strategy: EqualCells, PixelMask, EncodingType, RawPixelCodes, PixelCodeAndDisplacement
            if(this.directionheader[x][1] & 0x02) {
                this.dataheader[x][0] = this.readBits(this.file.data, ptr, 20, false);
            }
            
            this.dataheader[x][1] = this.readBits(this.file.data, ptr, 20, false);
            
            if(this.directionheader[x][1] & 0x01) {
                this.dataheader[x][2] = this.readBits(this.file.data, ptr, 20, false);
                this.dataheader[x][3] = this.readBits(this.file.data, ptr, 20, false);
            }
            
            // PixelValuesKey
            for (var i = 0; i < 256; i++) {
                if(this.readBits(this.file.data, ptr, 1, false) != 0)
                    this.dataheader[x][4].push(i);
            }
            
            // EqualCells
            this.bitstream[x].push([]);
            this.bitstream[x][0] = {
                stream: [],
                idx: 0
            };
            for (var j = 0; j < (this.dataheader[x][0] / 1); j++) {
                this.bitstream[x][0].stream.push(this.readBits(this.file.data, ptr, 1, false));
            }
            
            // PixelMask
            this.bitstream[x].push([]);
            this.bitstream[x][1] = {
                stream: [],
                idx: 0
            };
            for (var j = 0; j < (this.dataheader[x][1] / 4); j++) {
                this.bitstream[x][1].stream.push(this.readBits(this.file.data, ptr, 4, false));
            }
            
            // EncodingType
            this.bitstream[x].push([]);
            this.bitstream[x][2] = {
                stream: [],
                idx: 0
            };
            for (var j = 0; j < (this.dataheader[x][2] / 1); j++) {
                this.bitstream[x][2].stream.push(this.readBits(this.file.data, ptr, 1, false));
            }
              
            // RawPixelCodes
            this.bitstream[x].push([]);
            this.bitstream[x][3] = {
                stream: [],
                idx: 0
            };
            for (var j = 0; j < (this.dataheader[x][3] / 8); j++) {
                this.bitstream[x][3].stream.push(this.readBits(this.file.data, ptr, 8, false));
            }

            var dir_size;
            if (x == (this.fileheader[2] - 1))
                dir_size = 8 * (this.file.data.length - ptr.cur_byte) - ptr.cur_bit;
            else
                dir_size = 8 * (this.directionpointer[x + 1] - ptr.cur_byte) - ptr.cur_bit;
            
            this.dataheader[x][5] = dir_size;
            
            // PixelCodeAndDisplacement
            this.bitstream[x].push([]);
            this.bitstream[x][4] = {
                stream: [],
                idx: 0,
                ptr: {
                    cur_byte: ptr.cur_byte,
                    cur_bit: ptr.cur_bit
                }
            };

            for (var j = 0; j < (this.dataheader[x][5] / 4); j++) {
                this.bitstream[x][4].stream.push(this.readBits(this.file.data, ptr, 4, false));
            }
            
            this.pixelData = [];
            this.cell_buffer = [];
            
            /** Start Prepare Frame Buffer Cell's **/
            
            for (var y = 0; y < this.fileheader[3]; y++) {              
                var start_width = (4 - ((this.framebox[x][y].xmin - this.directionbox[x].xmin) % 4));
                var start_height = (4 - ((this.framebox[x][y].ymin - this.directionbox[x].ymin) % 4));
                
                var first_col = (this.framebox[x][y].width - start_width)<=1?this.framebox[x][y].width:start_width;
                var first_row = (this.framebox[x][y].height - start_height)<=1?this.framebox[x][y].height:start_height;
                
                var mid_cols = 1 + Math.trunc((this.framebox[x][y].width - start_width - 1) / 4);
                var mid_rows = 1 + Math.trunc((this.framebox[x][y].height - start_height - 1) / 4);
                
                var last_col = (this.framebox[x][y].width - first_col)==0?-1:((this.framebox[x][y].width - first_col) % 4);   // if 0, append width 4 at end
                var last_row = (this.framebox[x][y].height - first_row)==0?-1:((this.framebox[x][y].height - first_row) % 4);   // if 0, append width 4 at end
                
                if((last_col == 1) || (last_col < 0)) // manually corrected
                    mid_cols--;
                    
                if((last_row == 1) || (last_row < 0)) // manually corrected
                    mid_rows--;
                
                for (var i = 0; i < (mid_rows + 1); i++) {
                    this.framebox[x][y].cells.push([]);
                    for (var j = 0; j < mid_cols; j++) {
                        this.framebox[x][y].cells[this.framebox[x][y].cells.length-1].push({
                            w: (j == 0)?first_col:4, // first col can be smaller 4
                            h: (i == 0)?first_row:( (i == mid_rows)?( (last_row <= 1)?(4+last_row):last_row ):4 ) // first row can be smaller 4, last row can be higher or smaller 4
                        });
                    }
                    this.framebox[x][y].cells[this.framebox[x][y].cells.length-1].push({
                        w: (j == 0)?first_col:((last_col > 0)?((last_col == 1)?5:last_col):4), // last row can be higher or smaller 4
                        h: (i == 0)?first_row:( (i == mid_rows)?( (last_row <= 1)?(4+last_row):last_row ):4 ) // first row can be smaller 4, last row can be higher or smaller 4
                    });
                }
                
                // Stage 1, fill pixel buffer
                try {
                    this.decodePixelData(x, y);
                    console.log("Finished decompressing Direction", x, "Frame:", y);
                } catch(e) {
                    console.error(this.file.name, "Failed Decoding Frame [Direction,Frame]:", "[" + x + "," + y + "]", e);
                }
            }
            
            /** End Prepare Frame Buffer Cell's **/
            
            // prepare the stage 2
            // replace color codes in pixel buffer
            for (var i = 0; i < this.pixelData.length; i++) {
                for (var j = 0; j < 4; j++) {
                    var c = this.pixelData[i].val[j];
                    this.pixelData[i].val[j] = this.dataheader[x][4][c];
                }
            }
            
            // adjust PixelCodeAndDisplacement stream_ptr
            var bits = this.bitstream[x][4].ptr.cur_bit + (this.bitstream[x][4].idx % 2) * 4;
            this.bitstream[x][4].ptr = {
                cur_byte: Math.trunc(this.bitstream[x][4].ptr.cur_byte + this.bitstream[x][4].idx / 2) + Math.trunc(bits / 8),
                cur_bit: bits%8
            };
            
            for (var frame = 0; frame < this.fileheader[3]; frame++) {
                // stage 2, populate sprite data
                this.spriteData[x].push([]);
                this.spriteData[x][frame] = {
                    width: this.directionbox[x].width,
                    height: this.directionbox[x].height,
                    data: this.create2dArray(this.directionbox[x].height, this.directionbox[x].width)
                };
                
                try {
                    this.buildFrame(x, frame);
                    console.log("Finished building Direction", x, "Frame:", frame);
                } catch(e) {
                    console.error(this.file.name, "Failed Building Frame [Direction,Frame]:", "[" + x + "," + frame + "]", e);
                }
                
                idx = Math.ceil(this.bitstream[x][4].ptr.cur_byte + (this.bitstream[x][4].ptr.cur_bit / 8));
            }
            
            console.log("Finished Direction:", x);
        }
        
        // console.log("File Header:",this.fileheader);
        // console.log("Direction Pointer:",this.directionpointer);
        // console.log("Direction Header:",this.directionheader, "Direction Cells:", this.directionbox);
        // console.log("Frame Header:",this.frameheader, "Frame Cells:", this.framebox);
        // console.log("Data Header", this.dataheader);
        // console.log("Bitstream", this.bitstream);
        
        //console.log("\nFinished:",this.spriteData);
        
        this.directionbox = null;//[];
        this.framebox = null;//[];
        this.bitstream = null;//[];
        this.frame_buffer = null;//[];
        this.cell_buffer = null;//[];
        this.pixelData = null;//[];
        
        if(this.palettes[0])
            this.selectComposition({target:{value:this.palettes[0].map, name:this.palettes[0].name}});
    },
    updated() {
        if(this.directions.length === 0 && this.palettes[0])
            this.selectComposition({target:{value:this.palettes[0].map, name:this.palettes[0].name}});
        else
            this.selectComposition(null);
    }
});
 
(function() {
    new Vue({
        el: '#animationapp',
        mixins: [ eventHub ],
        data: {
            dcc_files: [ ]
        },
        methods: {
            removeAnimation: function(composition) {
                console.log(composition);
                this.dcc_files.splice(this.dcc_files.indexOf(composition),1);
            }
        },
        mounted() {
            this.eventHub.$on('new_animation', data => {
                this.dcc_files.push(data);
            });
        }
        
        
    });
})();