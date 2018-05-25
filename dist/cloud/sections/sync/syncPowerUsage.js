"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Log_1 = require("../../../logging/Log");
const Util_1 = require("../../../util/Util");
const cloudAPI_1 = require("../../cloudAPI");
const ExternalConfig_1 = require("../../../ExternalConfig");
const PermissionManager_1 = require("../../../backgroundProcesses/PermissionManager");
exports.cleanupPowerUsage = function (state, actions) {
    Log_1.LOG.info("SYNC: cleanupPowerUsage starting");
    let deleteHistoryThreshold = new Date().valueOf() - ExternalConfig_1.HISTORY_PERSISTENCE;
    let sphereIds = Object.keys(state.spheres);
    // check if we have to delete old data:
    for (let i = 0; i < sphereIds.length; i++) {
        // for all spheres
        let sphere = state.spheres[sphereIds[i]];
        let stoneIds = Object.keys(sphere.stones);
        for (let j = 0; j < stoneIds.length; j++) {
            // for all stones in this sphere
            let stone = sphere.stones[stoneIds[j]];
            let dateIds = Object.keys(stone.powerUsage);
            // for all days of power usage we keep:
            for (let k = 0; k < dateIds.length; k++) {
                // check if we have to delete this block if it is too old.
                if (new Date(dateIds[k]).valueOf() < deleteHistoryThreshold) {
                    actions.push({
                        type: 'REMOVE_POWER_USAGE_DATE',
                        sphereId: sphereIds[i],
                        stoneId: stoneIds[j],
                        dateId: dateIds[k]
                    });
                }
            }
        }
    }
};
exports.syncPowerUsage = function (state, actions) {
    Log_1.LOG.info("SYNC: syncPowerUsage starting");
    // if we do not upload the data, skip. Even if we have High Frequency Data enabled, this method act as a fallback uploader.
    if (state.user.uploadPowerUsage !== true) {
        return;
    }
    let sphereIds = Object.keys(state.spheres);
    let uploadBatches = [];
    // this is split to reduce the load in the cloud. For the current implementation without cassandra, 100 is max. A request takes about 2 seconds.
    let maxBatchSize = 100;
    // check if we have to upload local data:
    for (let i = 0; i < sphereIds.length; i++) {
        if (!PermissionManager_1.Permissions.inSphere(sphereIds[i]).canUploadData) {
            continue;
        }
        // for all spheres
        let sphere = state.spheres[sphereIds[i]];
        let stoneIds = Object.keys(sphere.stones);
        for (let j = 0; j < stoneIds.length; j++) {
            // for all stones in this sphere
            let stone = sphere.stones[stoneIds[j]];
            let dateIds = Object.keys(stone.powerUsage);
            // for all days of power usage we keep:
            for (let k = 0; k < dateIds.length; k++) {
                let powerUsageBlock = stone.powerUsage[dateIds[k]];
                // check if we have to upload this block
                if (powerUsageBlock.cloud.synced === false) {
                    let indices = [];
                    let uploadData = [];
                    let data = powerUsageBlock.data;
                    for (let x = 0; x < data.length; x++) {
                        // if synced is null, it will not be synced.
                        if (data[x].synced === false) {
                            uploadData.push({ power: data[x].power, powerFactor: data[x].powerFactor, timestamp: data[x].timestamp, applianceId: data[x].applianceId });
                            indices.push(x);
                            if (uploadData.length >= maxBatchSize) {
                                uploadBatches.push({
                                    data: uploadData,
                                    indices: indices,
                                    sphereId: sphereIds[i],
                                    stoneId: stoneIds[j],
                                    dateId: dateIds[k]
                                });
                                uploadData = [];
                                indices = [];
                            }
                        }
                    }
                    if (uploadData.length > 0) {
                        uploadBatches.push({
                            data: uploadData,
                            indices: indices,
                            sphereId: sphereIds[i],
                            stoneId: stoneIds[j],
                            dateId: dateIds[k]
                        });
                    }
                }
            }
        }
    }
    let uploadCounter = 0;
    return Util_1.Util.promiseBatchPerformer(uploadBatches, (uploadBatch) => {
        let stoneId = uploadBatch.stoneId;
        let sphereId = uploadBatch.sphereId;
        let dateId = uploadBatch.dateId;
        uploadCounter++;
        let t1 = new Date().valueOf();
        Log_1.LOG.info("SYNC: Uploading batch: ", uploadCounter, ' from ', uploadBatches.length, ' which has ', uploadBatch.data.length, ' data points');
        return cloudAPI_1.CLOUD.forStone(stoneId).updateBatchPowerUsage(uploadBatch.data, true)
            .then(() => {
            Log_1.LOG.info("SYNC: Finished batch in", new Date().valueOf() - t1, 'ms');
            actions.push({
                type: "SET_BATCH_SYNC_POWER_USAGE",
                sphereId: sphereId,
                stoneId: stoneId,
                dateId: dateId,
                data: { indices: uploadBatch.indices }
            });
        })
            .catch((err) => {
            Log_1.LOG.error("SYNC: Could not upload samples", uploadBatch.indices, "due to:", err);
        });
    }).catch((err) => {
        Log_1.LOG.error("SYNC: Error during sample upload", err);
    });
};
//# sourceMappingURL=syncPowerUsage.js.map