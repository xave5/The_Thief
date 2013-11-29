require(["assets",
        "map",
        "countdown",
        "entity",
        "player",
        "guard",
        "goal",
        "input",
        "audio",
        "lib/util",
        "lib/underscore"],

function (Assets,
        Map,
        Countdown,
        Entity,
        Player,
        Guard,
        Goal,
        Input,
        Audio,
        Util,
        __) {
    "use strict";

    var framebuffer = document.createElement("canvas");
    var gameCanvas = document.createElement("canvas");
    var bgrender = document.createElement("canvas");
    var quit;
    var input;
    var levelName;

    var camera = {
        offx: undefined,
        offy: undefined,
        scale: 2
    };
        

    function bindEvents() {

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
        var goal = {};
        var guards = [];

        var countdown = new Countdown(9);

        countdown.addEventListener("tick", function () {
            Audio.play("blip");
        });
        
        countdown.addEventListener("timeup", function () {
            if (countdown.failed) {
                restartLevel();
                Audio.play("timeup");
            }
        });

        function loadEntities(layer, callback) {
            Util.getJSON("entities.json", function (entities) {
                player = _.find(layer.objects, function (obj) {
                    return obj.type === "player";
                });

                goal = _.find(layer.objects, function (obj) {
                    return obj.type === "treasure";
                });

                var guards_ = _.select(layer.objects, function (obj) {
                    return obj.type === "guard";
                });

                player = new Player(player, map, entities);
                goal = new Goal(goal, map, entities);

                goal.addEventListener("open", function () {
                    countdown.start();
                    Audio.play("goal");
                });

                guards = _.map(guards_, function (guard) {
                    var guard = new Guard(guard, player, map, entities);

                    guard.addEventListener("alerted", function (e, g) {
                        if (g.alerted) {
                            Audio.play("alerted");
                        }
                    });

                    guard.addEventListener("hit", function () {
                        Audio.play("hit");
                        restartLevel();
                    });

                    return guard;
                });

                player.addEventListener("step", function () {
                    Audio.play("step");
                });

                if (callback) callback();
            });
        }

        function restartLevel(layer) {
            player.reset();
            goal.reset();
            _.each(guards, function (guard) {
                guard.reset();
            });
            countdown.reset();
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
                guard.update(dt, bgLayer, aiLayer);
            });

            if (player.collide(goal)) {
                goal.open(player);
            }
            
            countdown.update();
            
            /* Check if thief is on exit */
            var props = map.getTileProps(bgLayer, player.x, player.y);
            if (props && props.isexit && props.isexit === "true") {
                if (player.goals > 0) {
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
            map.drawEntity(goal, camera, fbCtx);
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

            input.process(dt);
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

        (function init() {
            quit = false;
            lastUpdate = Util.getTicks();
            outCtx.imageSmoothingEnable = false;
            fbCtx.imageSmoothingEnable = false;

            loadEntities(entLayer, function () {
                if (input) {
                    input.unbindEvents();
                }
                input = new Input(gameCanvas, camera, player);
                input.bindEvents();
                mainloop();
            });
        })();
    }

    bindEvents();
    levelName = Util.getParameterByName("map");

    levelName = (levelName === "") ? "intro.json" : levelName;
    Util("container").appendChild(gameCanvas);
    
    Assets.load(function () {
        Audio.load(Assets);
        loadLevel(levelName);
    });
});
