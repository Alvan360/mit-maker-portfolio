#target illustrator

(function () {

    // ============================================================
    // SETTINGS
    // ============================================================

    var TEMP_NAME =
        "__OVERLAP_CLASSIFICATION_TEMP__";


    // ============================================================
    // DOCUMENT
    // ============================================================

    if (app.documents.length === 0) {
        alert("No Illustrator document is open.");
        return;
    }

    var doc = app.activeDocument;
    var source = doc.activeLayer;


    // ============================================================
    // IDENTIFY GENERATED OUTPUT LAYERS
    // ============================================================

    function isOverlapLayer(name) {

        return /^(\d+)\s+Layer Intersections$/.test(name);
    }


    // ============================================================
    // FIND ORIGINAL SHADOW OBJECTS
    // ============================================================

    var shadows = [];

    for (var i = 0; i < source.pageItems.length; i++) {

        var item = source.pageItems[i];

        if (item.name === TEMP_NAME) {
            continue;
        }

        if (isOverlapLayer(item.name)) {
            continue;
        }

        shadows.push(item);
    }


    var SHADOW_COUNT = shadows.length;


    if (SHADOW_COUNT < 1) {

        alert(
            "No original shadow objects were found."
        );

        return;
    }


    // ============================================================
    // ASK FOR MULTIPLE OVERLAP COUNTS
    // ============================================================

    var input = prompt(

        "Found " +
        SHADOW_COUNT +
        " original shadow objects.\n\n" +

        "Which exact overlap counts do you want?\n\n" +

        "Enter numbers separated by commas.\n" +

        "Example: 2,4,5,6",

        "2,4,6"
    );


    if (input === null) {
        return;
    }


    // ============================================================
    // PARSE REQUESTED COUNTS
    // ============================================================

    var requested = [];
    var parts = input.split(",");


    for (var p = 0; p < parts.length; p++) {

        var value =
            parseInt(
                parts[p].replace(
                    /^\s+|\s+$/g,
                    ""
                ),
                10
            );


        if (
            !isNaN(value) &&
            value >= 1 &&
            value <= SHADOW_COUNT
        ) {

            // Avoid duplicates

            var alreadyThere = false;

            for (
                var r = 0;
                r < requested.length;
                r++
            ) {

                if (requested[r] === value) {
                    alreadyThere = true;
                    break;
                }
            }


            if (!alreadyThere) {
                requested.push(value);
            }
        }
    }


    // ============================================================
    // SORT NUMERICALLY
    // ============================================================

    requested.sort(function (a, b) {
        return a - b;
    });


    if (requested.length === 0) {

        alert(
            "No valid overlap counts were entered.\n\n" +
            "Enter values between 1 and " +
            SHADOW_COUNT +
            "."
        );

        return;
    }


    // ============================================================
    // CREATE LOOKUP TABLE
    // ============================================================

    var requestedLookup = [];


    for (
        var q = 0;
        q < requested.length;
        q++
    ) {

        requestedLookup[
            requested[q]
        ] = true;
    }


    // ============================================================
    // REMOVE OLD OUTPUT/TEMP LAYERS
    // ============================================================

    for (
        var l = source.layers.length - 1;
        l >= 0;
        l--
    ) {

        var layerName =
            source.layers[l].name;


        if (
            layerName === TEMP_NAME ||
            isOverlapLayer(layerName)
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
        var o = 0;
        o < requested.length;
        o++
    ) {

        var overlapCount =
            requested[o];


        var layer =
            source.layers.add();


        layer.name =
            overlapCount +
            " Layer Intersections";


        outputLayers[
            overlapCount
        ] = layer;
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

            result.push(obj);
            return;
        }


        if (
            obj.typename ===
            "CompoundPathItem"
        ) {

            for (
                var i = 0;
                i <
                obj.pathItems.length;
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
                j <
                obj.pageItems.length;
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
    // GET ORIGINAL SHADOW PATHS
    // ============================================================

    var shadowPaths = [];


    for (
        var s = 0;
        s < SHADOW_COUNT;
        s++
    ) {

        var paths = [];


        getPaths(
            shadows[s],
            paths
        );


        shadowPaths.push(
            paths
        );
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

        var mt = 1 - t;


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
    // FLATTEN PATH
    // ============================================================

    var CURVE_STEPS = 8;


    function flattenPath(path) {

        var result = [];
        var points = path.pathPoints;


        if (points.length < 2) {
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
    // CACHE SHADOW GEOMETRY
    // ============================================================

    var shadowPolygons = [];


    for (
        var sh = 0;
        sh < SHADOW_COUNT;
        sh++
    ) {

        var polygons = [];


        for (
            var sp = 0;
            sp <
            shadowPaths[sh].length;
            sp++
        ) {

            var polygon =
                flattenPath(
                    shadowPaths[sh][sp]
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
    // POINT IN POLYGON
    // ============================================================

    function pointInPolygon(
        x,
        y,
        polygon
    ) {

        var inside = false;

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


            if (crosses) {
                inside = !inside;
            }


            j = i;
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


        var inside = false;


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

                inside = !inside;
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


        var inside = false;


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

                inside = !inside;
            }
        }


        return inside;
    }


    // ============================================================
    // GET ANCHOR AVERAGE
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

            var pts =
                paths[i].pathPoints;


            for (
                var j = 0;
                j < pts.length;
                j++
            ) {

                x +=
                    pts[j].anchor[0];

                y +=
                    pts[j].anchor[1];

                count++;
            }
        }


        if (count === 0) {
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
    // COLOR OUTPUT OBJECT
    // ============================================================

    function colorObject(
        obj,
        color
    ) {

        if (
            obj.typename ===
            "PathItem"
        ) {

            try {

                obj.filled = true;
                obj.fillColor = color;
                obj.stroked = false;

            } catch (e) {}

            return;
        }


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

                    obj.pathItems[i].filled = true;
                    obj.pathItems[i].fillColor = color;
                    obj.pathItems[i].stroked = false;
                }

            } catch (e) {}

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

                colorObject(
                    obj.pageItems[j],
                    color
                );
            }
        }
    }


    // ============================================================
    // DUPLICATE ALL SHADOWS
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
    // SELECT ALL
    // ============================================================

    doc.selection = null;


    for (
        var d2 = 0;
        d2 < copies.length;
        d2++
    ) {

        copies[d2].selected = true;
    }


    // ============================================================
    // DIVIDE
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


    doc.selection = null;


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


    doc.selection = null;


    // ============================================================
    // CLASSIFY ALL PIECES
    // ============================================================

    var totalPieces =
        temp.pageItems.length;


    var matchingCounts = [];

    var unableToLocatePoint = 0;
    var ignoredNonPaths = 0;


    // Statistics for every possible count.

    for (
        var sc = 0;
        sc <= SHADOW_COUNT;
        sc++
    ) {

        matchingCounts[sc] = 0;
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
        // Accept both PathItem AND CompoundPathItem.
        // ========================================================

        if (
            piece.typename !== "PathItem" &&
            piece.typename !== "CompoundPathItem"
        ) {

            ignoredNonPaths++;
            continue;
        }


        // --------------------------------------------------------
        // Find an actual point inside the piece.
        // --------------------------------------------------------

        var testPoint =
            getInteriorPoint(
                piece
            );


        if (
            testPoint === null
        ) {

            unableToLocatePoint++;
            continue;
        }


        var x =
            testPoint[0];

        var y =
            testPoint[1];


        // --------------------------------------------------------
        // Count shadows.
        // --------------------------------------------------------

        var overlap = 0;


        for (
            var sh = 0;
            sh < SHADOW_COUNT;
            sh++
        ) {

            if (
                pointInsideShadow(
                    sh,
                    x,
                    y
                )
            ) {

                overlap++;
            }
        }


        matchingCounts[overlap]++;


        // --------------------------------------------------------
        // Move requested overlap to its output layer.
        // --------------------------------------------------------

        if (
            requestedLookup[overlap]
        ) {

            try {

                piece.move(
                    outputLayers[overlap],
                    ElementPlacement.PLACEATEND
                );

            } catch (e) {}
        }

    }


    // ============================================================
    // COLOR ALL OUTPUT LAYERS
    // ============================================================

    function getColor(index) {

        var c =
            new RGBColor();


        var colors = [
            [255, 0, 0],
            [0, 120, 255],
            [0, 180, 60],
            [255, 150, 0],
            [150, 0, 255],
            [255, 0, 150],
            [0, 180, 180],
            [120, 120, 120]
        ];


        var chosen =
            colors[
                index %
                colors.length
            ];


        c.red =
            chosen[0];

        c.green =
            chosen[1];

        c.blue =
            chosen[2];


        return c;
    }


    for (
        var colorIndex = 0;
        colorIndex < requested.length;
        colorIndex++
    ) {

        var count =
            requested[colorIndex];


        var layer =
            outputLayers[count];


        var fill =
            getColor(
                colorIndex
            );


        /*
            CHANGED:
            colorObject now handles PathItems,
            CompoundPathItems, and Groups.
        */

        for (
            var itemIndex = 0;
            itemIndex < layer.pageItems.length;
            itemIndex++
        ) {

            colorObject(
                layer.pageItems[itemIndex],
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


    doc.selection = null;


    // ============================================================
    // REPORT
    // ============================================================

    var report =
        "OVERLAP CLASSIFICATION COMPLETE\n\n" +

        "Original shadows: " +
        SHADOW_COUNT +
        "\n\n" +

        "Requested layers:\n";


    for (
        var rr = 0;
        rr < requested.length;
        rr++
    ) {

        var requestedCount =
            requested[rr];


        report +=
            requestedCount +
            " overlaps: " +
            matchingCounts[requestedCount] +
            " regions\n";
    }


    report +=
        "\nTotal divided regions: " +
        totalPieces;


    report +=
        "\nCould not find interior point: " +
        unableToLocatePoint;


    report +=
        "\nNon-path regions ignored: " +
        ignoredNonPaths;


    alert(report);

})();