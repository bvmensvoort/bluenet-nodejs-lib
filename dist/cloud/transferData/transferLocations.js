"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cloudAPI_1 = require("../cloudAPI");
const Log_1 = require("../../logging/Log");
const transferUtil_1 = require("./shared/transferUtil");
let fieldMap = [
    { local: 'name', cloud: 'name' },
    { local: 'icon', cloud: 'icon' },
    { local: 'updatedAt', cloud: 'updatedAt' },
    { local: 'pictureId', cloud: 'imageId', cloudToLocalOnly: true },
    // used for local config
    { local: 'cloudId', cloud: 'id', cloudToLocalOnly: true },
    { local: 'fingerprintRaw', cloud: null },
    { local: 'fingerprintParsed', cloud: null },
];
exports.transferLocations = {
    fieldMap: fieldMap,
    createOnCloud: function (actions, data) {
        let payload = {};
        let localConfig = data.localData.config;
        transferUtil_1.transferUtil.fillFieldsForCloud(payload, localConfig, fieldMap);
        return cloudAPI_1.CLOUD.forSphere(data.cloudSphereId).createLocation(payload)
            .then((result) => {
            // update cloudId in local database.
            actions.push({ type: 'UPDATE_LOCATION_CLOUD_ID', sphereId: data.localSphereId, locationId: data.localId, data: { cloudId: result.id } });
            return result.id;
        })
            .catch((err) => {
            Log_1.LOG.error("Transfer-Location: Could not create location in cloud", err);
            throw err;
        });
    },
    updateOnCloud: function (data) {
        if (data.cloudId === undefined) {
            return new Promise((resolve, reject) => { reject({ status: 404, message: "Can not update in cloud, no cloudId available" }); });
        }
        let payload = {};
        let localConfig = data.localData.config;
        transferUtil_1.transferUtil.fillFieldsForCloud(payload, localConfig, fieldMap);
        return cloudAPI_1.CLOUD.forSphere(data.cloudSphereId).updateLocation(data.cloudId, payload)
            .then((result) => { })
            .catch((err) => {
            Log_1.LOG.error("Transfer-Location: Could not update location in cloud", err);
            throw err;
        });
    },
    createLocal: function (actions, data) {
        return transferUtil_1.transferUtil._handleLocal(actions, 'ADD_LOCATION', { sphereId: data.localSphereId, locationId: data.localId }, data, fieldMap);
    },
    updateLocal: function (actions, data) {
        return transferUtil_1.transferUtil._handleLocal(actions, 'UPDATE_LOCATION_CONFIG', { sphereId: data.localSphereId, locationId: data.localId }, data, fieldMap);
    },
};
//# sourceMappingURL=transferLocations.js.map