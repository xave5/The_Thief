require(["lib/util",
        "assets",
        "map",
        "entity",
        "lib/underscore"],

function (Util, Assets, Map, Entity, __) {
    "use strict";

    var framebuffer = document.createElement("canvas");
    var gameCanvas = document.createElement("canvas");
    var bgrender = document.createElement("canvas");
    var quit;
    var alertImg = new Image();
    var entities = {};
    var levelName;

    var actions = {
        "up": false,
        "down": false,
        "left": false,
        "right": false
    };
    var keys = {
        // WASD
        87: "up",
        65: "left",
        83: "down",
        68: "right",

        // Arrows
        38: "up",
        37: "left",
        40: "down",
        39: "right",

        // ZQSD
        90: "up",
        81: "left"
    };
    var pointer;
    var pointerDown = false;
    var updatePointerFun;

    var camera = {
        offx: undefined,
        offy: undefined,
        scale: 2
    };

    // TODO: deprecate this function
    function playAudio(audio) {
        Assets.audio[audio].play();
    }

    function updatePointer(ev) {
        var off = gameCanvas.getBoundingClientRect();
        var offset = {
            left: ev.pageX - off.left,
            top: ev.pageY - off.top
        };

        pointer = {
            x: (offset.left / camera.scale) - camera.offx,
            y: (offset.top / camera.scale) - camera.offy
        };
    }

    function bindEvents() {
        function onMouse(e) {
            e.preventDefault();

            if (e.type === "mousedown") {
                pointerDown = true;
            } else if (e.type === "mouseup") {
                pointerDown = false;
                return;
            }

            if (pointerDown) updatePointer(e);
            return false;
        }

        function onTouch(e) {
            e.preventDefault();

            var touches = e.changedTouches;
            if (touches.length != 1) {
                return false;
            }
            var touch = touches[0];
            updatePointer(touch);

            return false;
        }

        function onKey(e) {
            e.preventDefault();

            var action = keys[e.keyCode];
            if (action) {
                actions[action] = (e.type == "keydown");
            }

        }
        
        function onResize(e) {
            var w = 640, h = 480;
            var style = gameCanvas.style;

            framebuffer.width = gameCanvas.width = Math.min(w / camera.scale,
                window.innerWidth / camera.scale);
            framebuffer.height = gameCanvas.height = Math.min(h / camera.scale,
                window.innerHeight / camera.scale);

            style.left = ((window.innerWidth - 
                    (gameCanvas.width * camera.scale)) / 2) + "px";

            style.width = (gameCanvas.width * camera.scale) + "px";
            style.height = (gameCanvas.height * camera.scale) + "px";
        }

        gameCanvas.addEventListener("mousedown", onMouse, true);
        gameCanvas.addEventListener("mouseup", onMouse, true);
        gameCanvas.addEventListener("mousemove", onMouse, true);

        gameCanvas.addEventListener("touchmove", onTouch, true);
        gameCanvas.addEventListener("touchend", onTouch, true);
        gameCanvas.addEventListener("touchstart", onTouch, true);

        window.addEventListener("keydown", onKey, true);
        window.addEventListener("keyup", onKey, true);

        window.addEventListener("resize", onResize, true);
        onResize();
    }

    function loadLevel(filename, callback) {
        quit = true;

        var map = new Map();
        map.load("maps/" + filename, function (map) {
            levelName = filename;
            if (typeof callback === "function") callback();
            playGame(map);
        });
    }

    function playGame(map) {
        // Preload some stuff, so we don't need to ask everytime where stuff is
        var outCtx = gameCanvas.getContext('2d');
        var fbCtx = framebuffer.getContext('2d');

        var bgLayer = map.getLayer("background");
        var aiLayer = map.getLayer("ai");
        var entLayer = map.getLayer("entities");
        
        var lastUpdate;

        var player = {};
        var treasure = {};
        var guards = [];

        var countdown = {
            startTime: undefined,
            failed: false,
            remaining: 0,
            lastsecs: 9,

            reset: function () {
                this.startTime = undefined;
                this.failed = false;
            },
            
            start: function () {
                this.startTime = this.curTime = Util.getTicks();
                this.failed = false;
            },

            update: function () {
                if (!this.startTime) return;

                var curTime = Util.getTicks();
                var diff = (10000) - (curTime - this.startTime);

                var secs = Math.floor(diff / 1000);
                var cents = Math.floor(diff / 10) % 100;
                this.str = "00:" + 
                    (secs < 10 ? "0" : "") + secs + ":" +
                    (cents < 10 ? "0" : "") + cents; 

                if (secs != this.lastsecs) {
                    playAudio("blip");
                    this.lastsecs = secs;
                }

                if (diff <= 0) {
                    diff = 0;
                    this.failed = true;
                    this.str = "00:00:00";
                }

                this.remaining = diff;
            },

            render: function (ctx) {
                if (!this.startTime) return;

                ctx.save();
                ctx.font = "bold 12pt monospace";
                ctx.fillText(this.str, 10, 20);
                ctx.restore();
            }
        };
        
        function prepareGuard(entity, map) {
            var guard = new Entity(entity, map, entities);

            guard.isFollowing = false;

            if (guard.properties.aiorder) {
                guard.aiorder = guard.properties.aiorder;
            } else {
                guard.aiorder = "stop";
            }

            if (guard.properties.aifollowdist) {
                guard.aifollowdist= parseInt(guard.properties.aifollowdist, 10);
            } else {
                guard.aifollowdist= 3;
            }
            
            if (guard.properties.aifollowspeed) {
                guard.aifollowspeed = parseInt(guard.properties.aifollowspeed, 10);
            } else {
                guard.aifollowspeed = Math.floor(3 * (player.start.speed / 4));
            }

            guard.orders = {
                rand: function (ent, dt) {
                    if (ent.target === undefined || ent.hasHitWall()) {
                        var dir = Math.floor(Math.random() * 4);
                        var amt = Math.floor(Math.random() * 200);
                        
                        switch (dir) {
                        case 0:
                            ent.setTarget(ent.x + amt, ent.y);
                            break;
                        case 1:
                            ent.setTarget(ent.x - amt, ent.y);
                            break;
                        case 2:
                            ent.setTarget(ent.x, ent.y + amt);
                            break;
                        case 3:
                            ent.setTarget(ent.x, ent.y - amt);
                            break;
                        }
                    }
                }, pause: function (ent, dt) {
                    var curTime = Util.getTicks();
                    if (ent.pauseTime === undefined) {
                        ent.pauseTime = curTime;
                    }

                    if (curTime - ent.pauseTime > 1000) {
                        ent.order = prevOrder; 
                    }
                }, left : function (ent, dt) {
                    ent.moveRelative(-dt, 0);
                }, right: function (ent, dt) {
                    ent.moveRelative(dt, 0);
                }, up : function (ent, dt) {
                    ent.moveRelative(0, -dt);
                }, down: function (ent, dt) {
                    ent.moveRelative(0, dt);
                }, follow: function (ent, dt) {
                    ent.setTarget(player.x, player.y);
                }, stop: function (ent, dt) {
                }
            };

            guard.update = function (dt, bgLayer) {
                var props = this.map.getTileProps(aiLayer, this.x, this.y);
                
                // Check distance to player
                var distX = Math.round(Math.abs(this.x - player.x) / map.tilewidth);
                var distY = Math.round(Math.abs(this.y - player.y) / map.tileheight);
                var dist = distX + distY; // Manhattan distance
                var order = this.aiorder;

                if (this.aifollowdist> 0 && dist <= this.aifollowdist) {
                    order = "follow";
                    if (!this.alerted) {
                        playAudio("alerted");
                        this.alerted = true;
                    }
                    this.speed = this.aifollowspeed;

                } else if (props && props.aiorder) {
                    this.speed = this.start.speed;
                    if (this.aiorder !== props.aiorder) {
                        this.prevOrder = this.aiorder;
                        this.aiorder = props.aiorder;
                        order = this.aiorder;
                    }
                    this.alerted = false;
                }

                var fun = this.orders[order];
                if (fun !== undefined) {
                    fun(this, dt);
                }

                this._update(dt, bgLayer);
            };

            return guard;
        }

        function preparePlayer(entity, map) {
            var player = new Entity(entity, map, entities);

            player.reset = function () {
                this.treasures = 0;
                this._reset();
            };

            player.reset();
            return player;
        }

        function prepareTreasure(entity, map) {
            var treasure = new Entity(entity, map, entities);
            treasure.isOpen = false;
            treasure.properties.closedgid = treasure.gid;
            
            treasure.reset = function () {
                this.isOpen = false;
                this.visible = true;
                this.gid = treasure.properties.closedgid;
                this._reset();
            };

            treasure.open = function (player) {
                if (this.isOpen) return;
                this.visible = false;
                this.gid = this.opengid;
                player.treasures++;
                this.isOpen = true;
                playAudio("treasure");
                countdown.start();
            };
            return treasure;
        }

        function loadEntities(layer, callback) {
            Util.getJSON("entities.json", function (json) {
                entities = json;

                player = _.find(layer.objects, function (obj) {
                    return obj.type === "player";
                });

                treasure = _.find(layer.objects, function (obj) {
                    return obj.type === "treasure";
                });

                var guards_ = _.select(layer.objects, function (obj) {
                    return obj.type === "guard";
                });

                player = preparePlayer(player, map);
                treasure = prepareTreasure(treasure, map);

                guards = _.map(guards_, function (guard) {
                    return prepareGuard(guard, map);
                });

                if (callback) callback();
            });
        }

        function restartLevel(layer) {
            player.reset();
            treasure.reset();
            _.each(guards, function (guard) {
                guard.reset();
            });
            countdown.reset();
        }

        function processInput(dt) {
            var dx = 0, dy = 0;
            if (actions.left) {
                dx = -1;
            } else if (actions.right) {
                dx = 1;
            }

            if (actions.up) {
                dy = -1;
            } else if (actions.down) {
                dy = 1;
            }

            if (dx !== 0 || dy !== 0) {
                player.moveRelative(dx * dt, dy * dt);
            }

            if (pointer) {
                player.setTarget(pointer.x, pointer.y);
                if (!pointerDown) pointer = undefined;
            }
        }

        function processLogic(dt) {
            /* Update camera */
            var toFollow = {
                x: player.x,
                y: player.y
            };
            var remaining = countdown.remaining;
            toFollow.x += (Math.sin(remaining) * 16);
            toFollow.y += (Math.cos(remaining) * 16);


            // Thanks Aru!
            if (camera.tempx && camera.tempx) {
                camera.tempx = ((camera.tempx * 5 + toFollow.x) / 6);
                camera.tempy = ((camera.tempy * 5 + toFollow.y) / 6);
            } else {
                camera.tempx = toFollow.x;
                camera.tempy = toFollow.y;
            }

            camera.offx = ((gameCanvas.width / 2) - camera.tempx);
            camera.offy = ((gameCanvas.height / 2) - camera.tempy);
            
            //camera.offx = ((gameCanvas.width / 2 / camera.scale) - camera.tempx);
            //camera.offy = ((gameCanvas.height / 2 / camera.scale) - camera.tempy);

            player.update(dt, bgLayer);
            _.each(guards, function (guard) {
                guard.update(dt, bgLayer);
            });

            if (player.collide(treasure)) {
                treasure.open(player);
            }
            
            countdown.update();
            
            /* Check if timeout */
            if (countdown.failed) {
                playAudio("timeup");
                restartLevel();
                return;
            }

            /* Check if any guard hit the thief */
            var guards_ = _.filter(guards, function (guard) {
                return player.collide(guard);
            }); 

            if (guards_.length > 0) {
                playAudio("hit");
                restartLevel();
                return;
            }

            /* Check if thief is on exit */
            var props = map.getTileProps(bgLayer, player.x, player.y);
            if (props && props.isexit && props.isexit === "true") {
                if (player.treasures > 0) {
                    loadLevel(map.properties.nextmap);
                }
            }
        }
        
        function renderGame() {
            fbCtx.clearRect(0, 0, framebuffer.width, framebuffer.height); 
            fbCtx.save();
            fbCtx.translate(
                    Math.floor(camera.offx),
                    Math.floor(camera.offy)
            );

            map.drawTileLayer(bgLayer, fbCtx);
            //map.drawTileLayer(aiLayer, fbCtx);
            map.drawEntity(treasure, camera, fbCtx);
            _.each(guards, function (guard) {
                map.drawEntity(guard, camera, fbCtx);
            });

            map.drawEntity(player, camera, fbCtx);
            fbCtx.restore();

            countdown.render(fbCtx);

            outCtx.clearRect(0, 0, screen.width, screen.height); 
            outCtx.drawImage(framebuffer, 0, 0);
        }

        function mainloop() {
            var curTime = Util.getTicks();
            var dt = (curTime - lastUpdate) / 60;

            processInput(dt);
            processLogic(dt);
            renderGame();

            lastUpdate = curTime;
            if (!quit) {
                if (window.requestAnimationFrame) {
                    window.requestAnimationFrame(mainloop);
                } else {
                    window.setTimeout(mainloop, 1000 / 60);
                }
            }
        }

        function init() {
            quit = false;
            lastUpdate = Util.getTicks();
            outCtx.imageSmoothingEnable = false;
            fbCtx.imageSmoothingEnable = false;

            loadEntities(entLayer, mainloop);
        }
        init();
    }

    bindEvents();
    levelName = Util.getParameterByName("map");

    levelName = (levelName === "") ? "intro.json" : levelName;
    Util("container").appendChild(gameCanvas);
    
    Assets.load(function () {
        loadLevel(levelName);
    });
});
