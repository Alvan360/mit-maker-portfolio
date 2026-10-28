#target illustrator

(function () {

    if (app.documents.length === 0) {
        alert("No Illustrator document.");
        return;
    }

    var doc = app.activeDocument;
    var source = doc.activeLayer;

    var TEMP_NAME = "__DIVIDE_STRUCTURE_TEST__";

    // ------------------------------------------------------------
    // Find source shadows
    // ------------------------------------------------------------

    var shadows = [];

    for (var i = 0; i < source.pageItems.length; i++) {

        var item = source.pageItems[i];

        if (
            item.name !== TEMP_NAME &&
            !/^(\d+)\s+Layer Intersections$/.test(item.name) &&
            item.layer === source
        ) {
            shadows.push(item);
        }
    }

    if (shadows.length < 1) {
        alert("No shadow objects found.");
        return;
    }

    // ------------------------------------------------------------
    // Remove old test layer
    // ------------------------------------------------------------

    for (var l = source.layers.length - 1; l >= 0; l--) {

        if (source.layers[l].name === TEMP_NAME) {
            source.layers[l].remove();
        }
    }

    var temp = source.layers.add();
    temp.name = TEMP_NAME;

    // ------------------------------------------------------------
    // Duplicate all shadows
    // ------------------------------------------------------------

    var copies = [];

    for (var s = 0; s < shadows.length; s++) {

        copies.push(
            shadows[s].duplicate(
                temp,
                ElementPlacement.PLACEATEND
            )
        );
    }

    // ------------------------------------------------------------
    // Select all
    // ------------------------------------------------------------

    doc.selection = null;

    for (var c = 0; c < copies.length; c++) {
        copies[c].selected = true;
    }

    // ------------------------------------------------------------
    // Divide
    // ------------------------------------------------------------

    app.executeMenuCommand("group");

    app.executeMenuCommand(
        "Live Pathfinder Divide"
    );

    try {
        app.executeMenuCommand("expandStyle");
    } catch (e) {}

    doc.selection = null;

    // ------------------------------------------------------------
    // Ungroup once
    // ------------------------------------------------------------

    if (temp.pageItems.length === 1) {

        try {

            temp.pageItems[0].selected = true;

            app.executeMenuCommand("ungroup");

        } catch (e) {}
    }

    doc.selection = null;

    // ------------------------------------------------------------
    // REPORT STRUCTURE
    // ------------------------------------------------------------

    var pathCount = 0;
    var compoundCount = 0;
    var groupCount = 0;
    var otherCount = 0;

    var report =
        "DIVIDE STRUCTURE\n\n" +
        "Total top-level objects: " +
        temp.pageItems.length +
        "\n\n";

    for (var p = 0; p < temp.pageItems.length; p++) {

        var obj = temp.pageItems[p];

        report +=
            "Object " +
            (p + 1) +
            ": " +
            obj.typename;

        if (obj.typename === "PathItem") {

            pathCount++;

            report +=
                " | points=" +
                obj.pathPoints.length +
                " | area=" +
                obj.area;
        }

        else if (
            obj.typename === "CompoundPathItem"
        ) {

            compoundCount++;

            report +=
                " | paths=" +
                obj.pathItems.length;
        }

        else if (
            obj.typename === "GroupItem"
        ) {

            groupCount++;

            report +=
                " | children=" +
                obj.pageItems.length;
        }

        else {
            otherCount++;
        }

        report += "\n";
    }

    report +=
        "\nPathItems: " +
        pathCount +
        "\n" +
        "CompoundPathItems: " +
        compoundCount +
        "\n" +
        "GroupItems: " +
        groupCount +
        "\n" +
        "Other: " +
        otherCount;

    alert(report);

})();