#target photoshop

(function () {

    // ============================================================
    // SETTINGS
    // ============================================================

    var FUZZINESS = 100;
    var RANGE = 255;

    // ============================================================
    // CHECK DOCUMENT
    // ============================================================

    if (app.documents.length === 0) {
        alert("No Photoshop document is open.");
        return;
    }

    var doc = app.activeDocument;

    // ============================================================
    // COLOR RANGE — HIGHLIGHTS
    // ============================================================

    function selectHighlights() {

        var desc = new ActionDescriptor();

        var idClrs = charIDToTypeID("Clrs");
        var idHghl = charIDToTypeID("Hghl");

        // Select Highlights
        desc.putEnumerated(
            idClrs,
            idClrs,
            idHghl
        );

        // Fuzziness
        desc.putInteger(
            stringIDToTypeID("highlightsFuzziness"),
            FUZZINESS
        );

        // Range
        desc.putInteger(
            stringIDToTypeID("highlightsLowerLimit"),
            RANGE
        );

        // Do not invert
        desc.putBoolean(
            stringIDToTypeID("invert"),
            false
        );

        // RGB
        desc.putInteger(
            stringIDToTypeID("colorModel"),
            0
        );

        executeAction(
            charIDToTypeID("ClrR"),
            desc,
            DialogModes.NO
        );
    }

    // ============================================================
    // PROCESS ONE LAYER
    // ============================================================

    function processLayer(layer) {

        // Only raster/pixel layers
        if (layer.kind !== LayerKind.NORMAL) {
            return;
        }

        // Skip locked layers
        if (layer.allLocked) {
            return;
        }

        // Activate layer
        doc.activeLayer = layer;

        try {

            // Clear existing selection
            doc.selection.deselect();

            // Select highlights
            selectHighlights();

            // Delete highlights
            doc.selection.clear();

            // Deselect
            doc.selection.deselect();

            // Hide the processed layer
            layer.visible = false;

        } catch (e) {

            try {
                doc.selection.deselect();
            } catch (_) {}

        }
    }

    // ============================================================
    // PROCESS LAYERS INSIDE GROUPS
    // TOP → BOTTOM
    // ============================================================

    function processLayers(layers) {

        // Photoshop stores layers from TOP to BOTTOM.
        // Start at index 0.
        for (var i = 0; i < layers.length; i++) {

            var layer = layers[i];

            if (layer.typename === "LayerSet") {

                // Process layers inside group from top to bottom
                processLayers(layer.layers);

            } else {

                processLayer(layer);

            }
        }
    }

    // ============================================================
    // RUN
    // ============================================================

    var oldDialogs = app.displayDialogs;

    try {

        app.displayDialogs = DialogModes.NO;

        // Start with the TOPMOST layer
        processLayers(doc.layers);

        try {
            doc.selection.deselect();
        } catch (_) {}

        alert("Finished processing all raster layers.");

    } catch (e) {

        alert(
            "Script error:\n\n" +
            e.message +
            "\n\nLine: " +
            e.line
        );

    } finally {

        app.displayDialogs = oldDialogs;

    }

})();