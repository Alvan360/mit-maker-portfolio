#target illustrator

(function () {

    // ============================================================
    // SETTINGS
    // ============================================================

    var TEMP_NAME = "__SHADOW_TIME_TEMP__";


    // ============================================================
    // OUTPUT CATEGORIES
    // ============================================================

    /*
        All values are in minutes.

        0-2 hours = 0–119 minutes
        2-4 hours = 120–239 minutes
        4-6 hours = 240–359 minutes
        6+ hours  = 360+ minutes
    */

    var CATEGORIES = [
        {
            name: "0-2 Hours Shadow",
            min: 0,
            max: 120
        },
        {
            name: "2-4 Hours Shadow",
            min: 120,
            max: 240
        },
        {
            name: "4-6 Hours Shadow",
            min: 240,
            max: 360
        },
        {
            name: "6+ Hours Shadow",
            min: 360,
            max: Infinity
        }
    ];


    // ============================================================
    // DOCUMENT
    // ============================================================

    if (app.documents.length === 0) {

        alert(
            "No Illustrator document is open."
        );

        return;
    }


    var doc =
        app.activeDocument;

    var source =
        doc.activeLayer;


    // ============================================================
    // IDENTIFY GENERATED OUTPUT LAYERS
    // ============================================================

    function isTimeOutputLayer(name) {

        return (
            name === "0-2 Hours Shadow" ||
            name === "2-4 Hours Shadow" ||
            name === "4-6 Hours Shadow" ||
            name === "6+ Hours Shadow"
        );
    }


    function isOverlapOutputLayer(name) {

        return /^(\d+)\s+Layer Intersections$/.test(name);
    }


    // ============================================================
    // FIND ORIGINAL SHADOW OBJECTS
    // ============================================================

    var shadows = [];


    for (
        var i = 0;
        i < source.pageItems.length;
        i++
    ) {

        var item =
            source.pageItems[i];


        // Only direct children of active layer.
        if (
            item.layer !== source
        ) {
            continue;
        }


        // Ignore temporary object.
        if (
            item.name === TEMP_NAME
        ) {
            continue;
        }


        // Ignore previous time-output objects.
        if (
            isTimeOutputLayer(
                item.name
            )
        ) {
            continue;
        }


        // Ignore old overlap-output objects.
        if (
            isOverlapOutputLayer(
                item.name
            )
        ) {
            continue;
        }


        shadows.push(
            item
        );
    }


    var SHADOW_COUNT =
        shadows.length;


    // ============================================================
    // CHECK SHADOW COUNT
    // ============================================================

    if (
        SHADOW_COUNT < 1
    ) {

        alert(
            "No shadow renderings were found.\n\n" +
            "Make sure the layer containing your shadow " +
            "renderings is active."
        );

        return;
    }


    // ============================================================
    // ASK FOR DURATION OF EACH RENDERING
    // ============================================================

    var durationInput =
        prompt(

            "Found " +
            SHADOW_COUNT +
            " shadow renderings.\n\n" +

            "Enter the duration represented by EACH " +
            "rendering, in minutes.\n\n" +

            "You need exactly " +
            SHADOW_COUNT +
            " numbers, in the same order as the " +
            "shadow objects in the active layer.\n\n" +

            "Example for 5 renderings:\n" +
            "60,60,60,60,25",

            "60,60,60,60,25"
        );


    if (
        durationInput === null
    ) {

        return;
    }


    // ============================================================
    // PARSE DURATIONS
    // ============================================================

    var durationParts =
        durationInput.split(",");


    var durations = [];


    for (
        var d = 0;
        d < durationParts.length;
        d++
    ) {

        var value =
            parseFloat(
                durationParts[d].replace(
                    /^\s+|\s+$/g,
                    ""
                )
            );


        if (
            isNaN(value) ||
            value < 0
        ) {

            alert(
                "Invalid duration:\n\n" +
                durationParts[d] +
                "\n\n" +
                "Enter non-negative numbers only."
            );

            return;
        }


        durations.push(
            value
        );
    }


    // ============================================================
    // VALIDATE DURATION COUNT
    // ============================================================

    if (
        durations.length !==
        SHADOW_COUNT
    ) {

        alert(

            "Duration count does not match " +
            "the number of shadow renderings.\n\n" +

            "Shadow renderings found: " +
            SHADOW_COUNT +
            "\n" +

            "Durations entered: " +
            durations.length +
            "\n\n" +

            "You need exactly " +
            SHADOW_COUNT +
            " durations."
        );

        return;
    }


    // ============================================================
    // SHOW CONFIRMATION
    // ============================================================

    var confirmation =
        "SHADOW RENDERINGS\n\n";


    for (
        var dc = 0;
        dc < SHADOW_COUNT;
        dc++
    ) {

        confirmation +=
            "Rendering " +
            (dc + 1) +
            ": " +
            (
                shadows[dc].name ||
                "(unnamed)"
            ) +
            " -> " +
            durations[dc] +
            " minutes\n";
    }


    // ExtendScript-compatible total.
    var totalRepresented = 0;


    for (
        var dt = 0;
        dt < durations.length;
        dt++
    ) {

        totalRepresented +=
            durations[dt];
    }


    confirmation +=
        "\nTotal represented time: " +
        totalRepresented +
        " minutes";


    if (
        !confirm(
            confirmation +
            "\n\nContinue?"
        )
    ) {

        return;
    }


    // ============================================================
    // REMOVE OLD OUTPUT / TEMP LAYERS
    // ============================================================

    for (
        var l =
            source.layers.length - 1;
        l >= 0;
        l--
    ) {

        var layerName =
            source.layers[l].name;


        if (
            layerName ===
            TEMP_NAME ||

            isTimeOutputLayer(
                layerName
            )
        ) {

            try {
                source.layers[l].remove();
            } catch (e) {}
        }
    }


    // ============================================================
    // CREATE OUTPUT LAYERS
    // ============================================================

    var outputLayers = [];


    for (
        var c = 0;
        c < CATEGORIES.length;
        c++
    ) {

        var outputLayer =
            source.layers.add();


        outputLayer.name =
            CATEGORIES[c].name;


        outputLayers.push(
            outputLayer
        );
    }


    // ============================================================
    // CREATE TEMP LAYER
    // ============================================================

    var temp =
        source.layers.add();


    temp.name =
        TEMP_NAME;


    // ============================================================
    // GET ALL PATHS FROM OBJECT
    // ============================================================

    function getPaths(
        obj,
        result
    ) {

        if (
            obj.typename ===
            "PathItem"
        ) {

            result.push(
                obj
            );

            return;
        }


        if (
            obj.typename ===
            "CompoundPathItem"
        ) {

            for (
                var i = 0;
                i < obj.pathItems.length;
                i++
            ) {

                result.push(
                    obj.pathItems[i]
                );
            }

            return;
        }


        if (
            obj.typename ===
            "GroupItem"
        ) {

            for (
                var j = 0;
                j < obj.pageItems.length;
                j++
            ) {

                getPaths(
                    obj.pageItems[j],
                    result
                );
            }
        }
    }


    // ============================================================
    // BEZIER POINT
    // ============================================================

    function bezierPoint(
        p0,
        p1,
        p2,
        p3,
        t
    ) {

        var mt =
            1 - t;


        return [

            mt * mt * mt * p0[0] +
            3 * mt * mt * t * p1[0] +
            3 * mt * t * t * p2[0] +
            t * t * t * p3[0],

            mt * mt * mt * p0[1] +
            3 * mt * mt * t * p1[1] +
            3 * mt * t * t * p2[1] +
            t * t * t * p3[1]
        ];
    }


    // ============================================================
    // CURVE APPROXIMATION
    // ============================================================

    var CURVE_STEPS = 8;


    function flattenPath(
        path
    ) {

        var result = [];

        var points =
            path.pathPoints;


        if (
            points.length < 2
        ) {

            return result;
        }


        for (
            var i = 0;
            i < points.length;
            i++
        ) {

            var current =
                points[i];

            var next =
                points[
                    (i + 1) %
                    points.length
                ];


            var p0 =
                current.anchor;

            var p1 =
                current.rightDirection;

            var p2 =
                next.leftDirection;

            var p3 =
                next.anchor;


            for (
                var s = 0;
                s < CURVE_STEPS;
                s++
            ) {

                var t =
                    s / CURVE_STEPS;


                result.push(
                    bezierPoint(
                        p0,
                        p1,
                        p2,
                        p3,
                        t
                    )
                );
            }
        }


        return result;
    }


    // ============================================================
    // CACHE ORIGINAL SHADOW GEOMETRY
    // ============================================================

    var shadowPolygons = [];


    for (
        var sh = 0;
        sh < SHADOW_COUNT;
        sh++
    ) {

        var paths = [];


        getPaths(
            shadows[sh],
            paths
        );


        var polygons = [];


        for (
            var p = 0;
            p < paths.length;
            p++
        ) {

            var polygon =
                flattenPath(
                    paths[p]
                );


            if (
                polygon.length >= 3
            ) {

                polygons.push(
                    polygon
                );
            }
        }


        shadowPolygons.push(
            polygons
        );
    }


    // ============================================================
    // POINT-IN-POLYGON
    // ============================================================

    function pointInPolygon(
        x,
        y,
        polygon
    ) {

        var inside =
            false;


        var j =
            polygon.length - 1;


        for (
            var i = 0;
            i < polygon.length;
            i++
        ) {

            var xi =
                polygon[i][0];

            var yi =
                polygon[i][1];

            var xj =
                polygon[j][0];

            var yj =
                polygon[j][1];


            var crosses =
                (
                    (yi > y) !==
                    (yj > y)
                )
                &&
                (
                    x <
                    (xj - xi) *
                    (y - yi) /
                    (yj - yi) +
                    xi
                );


            if (
                crosses
            ) {

                inside =
                    !inside;
            }


            j =
                i;
        }


        return inside;
    }


    // ============================================================
    // POINT INSIDE SHADOW
    // ============================================================

    function pointInsideShadow(
        shadowIndex,
        x,
        y
    ) {

        var polygons =
            shadowPolygons[
                shadowIndex
            ];


        var inside =
            false;


        for (
            var i = 0;
            i < polygons.length;
            i++
        ) {

            if (
                pointInPolygon(
                    x,
                    y,
                    polygons[i]
                )
            ) {

                inside =
                    !inside;
            }
        }


        return inside;
    }


    // ============================================================
    // POINT INSIDE DIVIDED PIECE
    // ============================================================

    function pointInsidePiece(
        piece,
        x,
        y
    ) {

        var paths = [];


        getPaths(
            piece,
            paths
        );


        var inside =
            false;


        for (
            var i = 0;
            i < paths.length;
            i++
        ) {

            var polygon =
                flattenPath(
                    paths[i]
                );


            if (
                polygon.length >= 3 &&
                pointInPolygon(
                    x,
                    y,
                    polygon
                )
            ) {

                inside =
                    !inside;
            }
        }


        return inside;
    }


    // ============================================================
    // GET AVERAGE OF ANCHORS
    // ============================================================

    function getAnchorAverage(
        piece
    ) {

        var paths = [];


        getPaths(
            piece,
            paths
        );


        var x = 0;
        var y = 0;
        var count = 0;


        for (
            var i = 0;
            i < paths.length;
            i++
        ) {

            var points =
                paths[i].pathPoints;


            for (
                var j = 0;
                j < points.length;
                j++
            ) {

                x +=
                    points[j].anchor[0];

                y +=
                    points[j].anchor[1];

                count++;
            }
        }


        if (
            count === 0
        ) {

            return null;
        }


        return [
            x / count,
            y / count
        ];
    }


    // ============================================================
    // FIND INTERIOR POINT
    // ============================================================

    function getInteriorPoint(
        piece
    ) {

        var b =
            piece.visibleBounds;


        var center = [

            (b[0] + b[2]) / 2,

            (b[1] + b[3]) / 2
        ];


        var average =
            getAnchorAverage(
                piece
            );


        var candidates = [
            center
        ];


        if (
            average !== null
        ) {

            candidates.push(
                average
            );


            candidates.push([

                center[0] * 0.25 +
                average[0] * 0.75,

                center[1] * 0.25 +
                average[1] * 0.75
            ]);


            candidates.push([

                center[0] * 0.50 +
                average[0] * 0.50,

                center[1] * 0.50 +
                average[1] * 0.50
            ]);


            candidates.push([

                center[0] * 0.75 +
                average[0] * 0.25,

                center[1] * 0.75 +
                average[1] * 0.25
            ]);


            /*
                Points between vertices and average.
            */

            var paths = [];


            getPaths(
                piece,
                paths
            );


            for (
                var p = 0;
                p < paths.length;
                p++
            ) {

                var pts =
                    paths[p].pathPoints;


                for (
                    var q = 0;
                    q < pts.length;
                    q++
                ) {

                    var a =
                        pts[q].anchor;


                    candidates.push([

                        (a[0] + average[0]) / 2,

                        (a[1] + average[1]) / 2
                    ]);
                }
            }
        }


        /*
            Try candidates.
        */

        for (
            var c = 0;
            c < candidates.length;
            c++
        ) {

            var x =
                candidates[c][0];

            var y =
                candidates[c][1];


            if (
                pointInsidePiece(
                    piece,
                    x,
                    y
                )
            ) {

                return [
                    x,
                    y
                ];
            }
        }


        /*
            Small fallback around center.
        */

        var offsets = [

            [-0.20, -0.20],
            [-0.20,  0.00],
            [-0.20,  0.20],

            [ 0.00, -0.20],
            [ 0.00,  0.20],

            [ 0.20, -0.20],
            [ 0.20,  0.00],
            [ 0.20,  0.20]
        ];


        var width =
            b[2] - b[0];

        var height =
            b[1] - b[3];


        for (
            var o = 0;
            o < offsets.length;
            o++
        ) {

            var tx =
                center[0] +
                width *
                offsets[o][0];

            var ty =
                center[1] +
                height *
                offsets[o][1];


            if (
                pointInsidePiece(
                    piece,
                    tx,
                    ty
                )
            ) {

                return [
                    tx,
                    ty
                ];
            }
        }


        return null;
    }


    // ============================================================
    // DUPLICATE ALL ORIGINAL SHADOWS
    // ============================================================

    var copies = [];


    for (
        var d = 0;
        d < SHADOW_COUNT;
        d++
    ) {

        copies.push(

            shadows[d].duplicate(
                temp,
                ElementPlacement.PLACEATEND
            )

        );
    }


    // ============================================================
    // SELECT ALL SHADOWS
    // ============================================================

    doc.selection =
        null;


    for (
        var d2 = 0;
        d2 < copies.length;
        d2++
    ) {

        copies[d2].selected =
            true;
    }


    // ============================================================
    // PATHFINDER DIVIDE
    // ============================================================

    try {

        app.executeMenuCommand(
            "group"
        );


        app.executeMenuCommand(
            "Live Pathfinder Divide"
        );

    } catch (e) {

        alert(
            "Pathfinder Divide failed:\n\n" +
            e
        );

        return;
    }


    // ============================================================
    // EXPAND
    // ============================================================

    try {

        app.executeMenuCommand(
            "expandStyle"
        );

    } catch (e) {}


    doc.selection =
        null;


    // ============================================================
    // UNGROUP
    // ============================================================

    if (
        temp.pageItems.length === 1
    ) {

        try {

            temp.pageItems[0].selected =
                true;

            app.executeMenuCommand(
                "ungroup"
            );

        } catch (e) {}
    }


    doc.selection =
        null;


    // ============================================================
    // CLASSIFY REGIONS
    // ============================================================

    var totalPieces =
        temp.pageItems.length;


    var unableToLocatePoint =
        0;


    var categoryCounts = [];


    for (
        var cc = 0;
        cc < CATEGORIES.length;
        cc++
    ) {

        categoryCounts[cc] =
            0;
    }


    for (
        var pieceIndex =
            totalPieces - 1;
        pieceIndex >= 0;
        pieceIndex--
    ) {

        var piece =
            temp.pageItems[
                pieceIndex
            ];


        // ========================================================
        // CHANGED:
        // Accept PathItem AND CompoundPathItem.
        // ========================================================

        if (
            piece.typename !== "PathItem" &&
            piece.typename !== "CompoundPathItem"
        ) {

            continue;
        }


        // --------------------------------------------------------
        // Find point inside region
        // --------------------------------------------------------

        var interiorPoint =
            getInteriorPoint(
                piece
            );


        if (
            interiorPoint === null
        ) {

            unableToLocatePoint++;

            continue;
        }


        var x =
            interiorPoint[0];

        var y =
            interiorPoint[1];


        // --------------------------------------------------------
        // DETERMINE SHADOW STATUS
        // --------------------------------------------------------

        var shaded = [];


        for (
            var sh2 = 0;
            sh2 < SHADOW_COUNT;
            sh2++
        ) {

            shaded[sh2] =
                pointInsideShadow(
                    sh2,
                    x,
                    y
                );
        }


        // --------------------------------------------------------
        // CALCULATE WEIGHTED SHADOW TIME
        // --------------------------------------------------------

        var totalMinutes =
            0;


        for (
            var timeIndex = 0;
            timeIndex < SHADOW_COUNT;
            timeIndex++
        ) {

            if (
                shaded[timeIndex]
            ) {

                totalMinutes +=
                    durations[
                        timeIndex
                    ];
            }
        }


        // --------------------------------------------------------
        // ASSIGN TO TIME CATEGORY
        // --------------------------------------------------------

        for (
            var categoryIndex = 0;
            categoryIndex < CATEGORIES.length;
            categoryIndex++
        ) {

            var category =
                CATEGORIES[
                    categoryIndex
                ];


            var belongs =
                totalMinutes >=
                    category.min &&

                totalMinutes <
                    category.max;


            if (
                belongs
            ) {

                try {

                    piece.move(
                        outputLayers[
                            categoryIndex
                        ],
                        ElementPlacement.PLACEATEND
                    );


                    categoryCounts[
                        categoryIndex
                    ]++;

                } catch (e) {}

                break;
            }
        }
    }


    // ============================================================
    // COLORS
    // ============================================================

    var colors = [

        [180, 180, 180],  // 0-2
        [255, 0, 0],      // 2-4
        [0, 120, 255],    // 4-6
        [150, 0, 255]     // 6+
    ];


    /*
        Recursively color:
            PathItem
            CompoundPathItem
            GroupItem
    */

    function colorObject(
        obj,
        color
    ) {

        // --------------------------------------------------------
        // PATH
        // --------------------------------------------------------

        if (
            obj.typename ===
            "PathItem"
        ) {

            try {

                obj.filled =
                    true;

                obj.fillColor =
                    color;

                obj.stroked =
                    false;

            } catch (e) {}

            return;
        }


        // --------------------------------------------------------
        // COMPOUND PATH
        // --------------------------------------------------------

        if (
            obj.typename ===
            "CompoundPathItem"
        ) {

            try {

                for (
                    var i = 0;
                    i < obj.pathItems.length;
                    i++
                ) {

                    obj.pathItems[i].filled =
                        true;

                    obj.pathItems[i].fillColor =
                        color;

                    obj.pathItems[i].stroked =
                        false;
                }

            } catch (e) {}

            return;
        }


        // --------------------------------------------------------
        // GROUP
        // --------------------------------------------------------

        if (
            obj.typename ===
            "GroupItem"
        ) {

            for (
                var j = 0;
                j < obj.pageItems.length;
                j++
            ) {

                colorObject(
                    obj.pageItems[j],
                    color
                );
            }
        }
    }


    for (
        var colorIndex = 0;
        colorIndex < CATEGORIES.length;
        colorIndex++
    ) {

        var fill =
            new RGBColor();


        fill.red =
            colors[colorIndex][0];

        fill.green =
            colors[colorIndex][1];

        fill.blue =
            colors[colorIndex][2];


        var output =
            outputLayers[
                colorIndex
            ];


        for (
            var itemIndex = 0;
            itemIndex <
                output.pageItems.length;
            itemIndex++
        ) {

            colorObject(
                output.pageItems[itemIndex],
                fill
            );
        }
    }


    // ============================================================
    // REMOVE TEMP
    // ============================================================

    try {
        temp.remove();
    } catch (e) {}


    doc.selection =
        null;


    // ============================================================
    // FINAL REPORT
    // ============================================================

    var report =
        "SHADOW-TIME ANALYSIS COMPLETE\n\n" +

        "Shadow renderings: " +
        SHADOW_COUNT +
        "\n\n" +

        "Durations used:\n";


    for (
        var dr = 0;
        dr < SHADOW_COUNT;
        dr++
    ) {

        report +=
            "Rendering " +
            (dr + 1) +
            ": " +
            durations[dr] +
            " min\n";
    }


    report +=
        "\nOutput regions:\n";


    for (
        var cr = 0;
        cr < CATEGORIES.length;
        cr++
    ) {

        report +=
            CATEGORIES[cr].name +
            ": " +
            categoryCounts[cr] +
            "\n";
    }


    report +=
        "\nDivided regions: " +
        totalPieces +

        "\nCould not find interior point: " +
        unableToLocatePoint;


    alert(report);

})();