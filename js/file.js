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
        data: {
            
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
                            for (var i=0; i<files.length; i++) {
                                var file = files[i];
                                var reader = new FileReader();

                                //attach event handlers here...
                                this.addEventHandler(reader, 'loadend', function(e, file) {
                                    var bin           = this.result; 
                                    var newFile       = document.createElement('div');
                                    var fileNumber = list.getElementsByTagName('div').length + 1;
                                    var fileType = "File"
                                    
                                    if(file.name.toLowerCase().indexOf(".dat") > -1 && bin.slice(0, 3) === "\0\0\0" && bin.slice(765) === "ÿÿÿ" && bin.length === 3 * 256) {
                                        eventHub.$emit('new_palette', { hash: hashString(file.name), name: file.name, data: bin, spritesheet: "", image: "" });
                                        fileType = "Palette";
                                    } else if(file.name.toLowerCase().indexOf(".dat") > -1 && bin.length % 256 === 0) {
                                        eventHub.$emit('new_colormap', { hash: hashString(file.name), name: file.name, data: bin, spritesheet: "", image: "" });
                                        fileType = "Color Map";
                                    } else if(file.name.toLowerCase().indexOf(".dcc") > -1) {
                                        eventHub.$emit('new_animation', { hash: hashString(file.name), name: file.name, data: bin, spritesheet: "", image: "" });
                                        fileType = "Animation";
                                    } else if(file.name.toLowerCase().indexOf(".dc6") > -1) {
                                        eventHub.$emit('new_spritesheet', { hash: hashString(file.name), name: file.name, data: bin, spritesheet: "", image: "" });
                                        fileType = "Spritesheet";
                                    } else {
                                        fileType = "<font color='red'>Unknown Format</font>";
                                    }
                                    
                                    newFile.innerHTML = 'File (<i><b>' +fileType+ '</b></i>) ' +fileNumber+ ' of ' +files.length+ ': \''+file.name+'\' ('+file.size+' B)';
                                    list.appendChild(newFile);  
                                    status.innerHTML = fileNumber < files.length 
                                                     ? 'File '+fileNumber+' of '+files.length+'...' 
                                                     : 'Done loading. processed '+fileNumber+' File(s).';

                                    
                                    //var img = document.createElement("img"); 
                                    //img.file = file;   
                                    //img.src = bin;
                                    //list.appendChild(img);
                                }.bindToEventHandler(file));

                                reader.readAsBinaryString(file);
                            }
                            return false;
                    });
                });
            } else { 
                document.getElementById('status').innerHTML = 'Your browser does not support the HTML5 FileReader.';
            }
            
        }
        
        
    });
})();






