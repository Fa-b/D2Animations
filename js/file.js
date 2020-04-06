/*!
 * D2 Animations Library v1.0
 * https://github.com/Fa-b/D2Animations
 * 
 * A js .dcc file parser to recolor D2 animations and/or export animation frames
 * 
 * Authors: Fa-b
 * Date: 2020/03/19
 */
 
Vue.component('filedropper', {
    props: ['file'],
    template: '<li>{{file.name}}</li>'
});

(function() {
    new Vue({
        el: '#fileapp',
        mixins: [ eventHub ],
        data: function() {
            return {
                progress: 0,
                roundTime: {
                    start: 0,
                    elapsed: 0,
                    total: 0
                },
                loadSemaphore: false
            }
        },
        methods: {
            addEventHandler: function(obj, evt, handler) {
                if(obj.addEventListener) {
                    // W3C method
                    obj.addEventListener(evt, handler, false);
                } else if(obj.attachEvent) {
                    // IE method.
                    obj.attachEvent('on'+evt, handler);
                } else {
                    // Old school method.
                    obj['on'+evt] = handler;
                }
            }

        },
        mounted() {
            Function.prototype.bindToEventHandler = function bindToEventHandler() {
                var handler = this;
                var boundParameters = Array.prototype.slice.call(arguments);
                //create closure
                return function(e) {
                    e = e || window.event; // get window.event if e argument missing (in IE)   
                    boundParameters.unshift(e);
                    handler.apply(this, boundParameters);
                }
            };
            
            this.eventHub.$on('loading', data => {
                this.progress = (100 * data.percent / data.max).toFixed(2);
                $("#filestatus").html(`
                <div>
                    <progress id="progressbar" value="` + data.percent + `" max="` + data.max + `">` + this.progress +  ` %</progress>
                    <p>Decompressing ` + data.file.name + ` (` + this.progress + ` %): ` + data.info + `</p>
                </div>`);
            });
            
            this.eventHub.$on('finish', data => {
                this.roundTime.elapsed = new Date().getTime();
                var time_ms = this.roundTime.elapsed - this.roundTime.start;
                this.roundTime.total += time_ms;
                var loadedFile = document.getElementById(data.file.hash);
                loadedFile.style.display = 'block';
                var fileList = document.getElementById("filelist").children;
                $("#filestatus").html(`<p>Done loading ` + fileList.length + ` files after ` + (this.roundTime.total / 1000).toFixed(3) + ` seconds in total.<br>Last processed: ` + data.file.name + ` (` + (time_ms / 1000).toFixed(3) + ` seconds)</p>`);
                this.loadSemaphore = false;
            });

            if(window.FileReader) { 
                this.addEventHandler(window, 'load', () => {
                    var status = document.getElementById('filestatus');
                    var drop = document.getElementById('filedrop');
                    var list = document.getElementById('filelist');
            
                    function cancel(e) {
                        if (e.preventDefault) { e.preventDefault(); }
                        return false;
                    }

                    // Tells the browser that we *can* drop on this target
                    this.addEventHandler(drop, 'dragover', cancel);
                    this.addEventHandler(drop, 'dragenter', cancel);
                    this.addEventHandler(drop, 'drop', (e) => {
                        e = e || window.event; // get window.event if e argument missing (in IE)   
                        if (e.preventDefault) { e.preventDefault(); } // stops the browser from redirecting off to the image.
                            var dt    = e.dataTransfer;
                            var files = dt.files;
                            var threaded = JSThread.create(async () => {
                                for (var i=0; i<files.length; i++) {
                                    while(this.loadSemaphore)
                                        await JSThread.sleep(10);
                                    this.loadSemaphore = true;
                                    var file = files[i];
                                    var reader = new FileReader();
                                    
                                    this.roundTime.start = new Date().getTime();
                                    $("#filestatus").html(`<progress id="progressbar" value="0" max="100">0 %</progress>`);
                                    
                                    //attach event handlers here...
                                    this.addEventHandler(reader, 'loadend', async function(e, file) {
                                        var bin           = this.result; 
                                        var newFile       = document.createElement('div');
                                        var fileType = "File"
                                        
                                        file.hash = hashString(file.name);
                                        newFile.id = file.hash;
                                        newFile.style.display = 'none';
                                        var exists = document.getElementById(newFile.id);
                                        if(exists) {
                                            eventHub.$emit('remove_file', { hash: file.hash, name: file.name, data: bin, spritesheet: "", image: "" });
                                            list.removeChild(exists);
                                            await JSThread.yield();
                                        } 
                                        
                                        list.appendChild(newFile); 
                                        
                                        if(file.name.toLowerCase().indexOf(".dat") > -1 && bin.slice(0, 3) === "\0\0\0" && bin.slice(765) === "ÿÿÿ" && bin.length === 3 * 256) {
                                            eventHub.$emit('new_palette', { hash: file.hash, name: file.name, data: bin, spritesheet: "", image: "" });
                                            fileType = "Palette";
                                        } else if(file.name.toLowerCase().indexOf(".dat") > -1 && bin.length % 256 === 0) {
                                            eventHub.$emit('new_colormap', { hash: file.hash, name: file.name, data: bin, spritesheet: "", image: "" });
                                            fileType = "Color Map";
                                        } else if(file.name.toLowerCase().indexOf(".dcc") > -1) {
                                            eventHub.$emit('new_animation', { hash: file.hash, name: file.name, data: bin, spritesheet: "", image: "" });
                                            fileType = "Animation";
                                        } else if(file.name.toLowerCase().indexOf(".dc6") > -1) {
                                            eventHub.$emit('new_spritesheet', { hash: file.hash, name: file.name, data: bin, spritesheet: "", image: "" });
                                            fileType = "Spritesheet";
                                        } else {
                                            fileType = "<font color='red'>Unknown Format</font>";
                                            this.loadSemaphore = false;
                                            newFile.style.display = 'block';
                                            eventHub.$emit('finish', { file: file });
                                        }
                                        
                                        newFile.innerHTML = 'File (<i><b>' +fileType+ '</b></i>): \''+file.name+'\' ('+bytesToSize(file.size) + ')';

                                        
                                        //var img = document.createElement("img"); 
                                        //img.file = file;   
                                        //img.src = bin;
                                        //list.appendChild(img);
                                    }.bindToEventHandler(file));

                                    reader.readAsBinaryString(file);
                                }
                                
                                return false;
                            });
                            
                            threaded().then((finish) => {
                                return finish;
                            }).catch((error) => {
                               console.error(error);
                            });
                            
                    });
                });
            } else { 
                document.getElementById('status').innerHTML = 'Your browser does not support the HTML5 FileReader.';
            }
            
        }
        
        
    });
})();






