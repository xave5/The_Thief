/* global Kinetic */
/* jslint browser: true */
(function Game() {
    "use strict";

    var gameCanvas = document.createElement("canvas");
    gameCanvas.id = "game";
    gameCanvas.width = 640;
    gameCanvas.height = 480;

    function toXY(index, map) {
        return {
            x: index % map.width,
            y: Math.floor(index / map.width)
        };
    }

    function fromXY(x, y, map) {
        return y * map.width + x;
    }

    function loadTileset(tileset) {
        var img = new Image();
        var deferred = $.Deferred();

        img.onload = function () {
            console.log("Image loaded");
            deferred.resolve();
        };

        img.src = tileset.image;
        tileset.img = img;

        return deferred.promise();
    }

    function loadMap(json, callback) {
        var map = json;
        var tilesetLoaders = [];

        _.each(map.tilesets, function (tileset) {
            tilesetLoaders.push(loadTileset(tileset));
        });
        
        $.when.apply(null, tilesetLoaders).done(function () {
            callback(map);
        });
    }

    function drawLayer(map, layer, ctx) {
        function findTileset(map, gid) {
            var tilesets = _.filter(map.tilesets, function (tileset) {
                return gid >= tileset.firstgid;
            });

            if (tilesets.length === 0) {
                return undefined;
            }

            return _.max(tilesets, function (tileset) {
                return tileset.firstgid;
            });
        }

        for (var i = 0; i < layer.data.length; i++) {
            var gid = layer.data[i];
            var xy = toXY(i, map);

            var tileset = findTileset(map, gid);

            if (tileset) {
                var txy = toXY(gid - tileset.firstgid, {
                    width: tileset.imagewidth / tileset.tilewidth,
                    height: tileset.imageheight / tileset.tileheight
                });

                ctx.drawImage(tileset.img,
                    txy.x * tileset.tilewidth,
                    txy.y * tileset.tileheight,
                    tileset.tilewidth,
                    tileset.tileheight,
                    xy.x * map.tilewidth,
                    xy.y * map.tileheight,
                    tileset.tilewidth,
                    tileset.tileheight);
            }
        }
    }


    function drawMap(map, ctx) {
        function getLayer(map, name) {
            return _.find(map.layers, function (layer) {
                return layer.name === name;
            });
        }

        var bgLayer = getLayer(map, "background");
        var entityLayer = getLayer(map, "entities");

        drawLayer(map, bgLayer, ctx);
        console.log("drawing ent layer");
        drawLayer(map, entityLayer, ctx);
    }

    $("div#container").append(gameCanvas);

    function mainloop(map) {
        function mainloop_() {
            var ctx = gameCanvas.getContext('2d');
            drawMap(map, ctx);
//            window.requestAnimationFrame(mainloop(map));
        }

        return mainloop_;
    }

    $(document).ready(function () {
        $.getJSON("maps/demo.json", function (json) {
            loadMap(json, function (map) {
                console.log("Map loaded");
                window.requestAnimationFrame(mainloop(map));
            });
        });
    });
}());
