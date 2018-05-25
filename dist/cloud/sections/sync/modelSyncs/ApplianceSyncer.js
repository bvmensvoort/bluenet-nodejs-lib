"use strict";
/**
 *
 * Sync the appliances from the cloud to the database.
 *
 */
Object.defineProperty(exports, "__esModule", { value: true });
const syncUtil_1 = require("../shared/syncUtil");
const cloudAPI_1 = require("../../../cloudAPI");
const Util_1 = require("../../../../util/Util");
const SyncingBase_1 = require("./SyncingBase");
const transferAppliances_1 = require("../../../transferData/transferAppliances");
const PermissionManager_1 = require("../../../../backgroundProcesses/PermissionManager");
class ApplianceSyncer extends SyncingBase_1.SyncingSphereItemBase {
    download() {
        return cloudAPI_1.CLOUD.forSphere(this.cloudSphereId).getAppliancesInSphere();
    }
    _getLocalData(store) {
        let state = store.getState();
        if (state && state.spheres[this.localSphereId]) {
            return state.spheres[this.localSphereId].appliances;
        }
        return {};
    }
    sync(store) {
        return this.download()
            .then((appliancesInCloud) => {
            let appliancesInState = this._getLocalData(store);
            let localApplianceIdsSynced = this.syncDown(appliancesInState, appliancesInCloud);
            this.syncUp(store, appliancesInState, localApplianceIdsSynced);
            return Promise.all(this.transferPromises);
        })
            .then(() => { return this.actions; });
    }
    syncDown(appliancesInState, appliancesInCloud) {
        let localApplianceIdsSynced = {};
        let cloudIdMap = this._getCloudIdMap(appliancesInState);
        // go through all appliances in the cloud.
        appliancesInCloud.forEach((appliance_from_cloud) => {
            let localId = cloudIdMap[appliance_from_cloud.id];
            // if we do not have a appliance with exactly this cloudId, verify that we do not have the same appliance on our device already.
            if (localId === undefined) {
                localId = this._searchForLocalMatch(appliancesInState, appliance_from_cloud);
            }
            // item exists locally.
            if (localId) {
                localApplianceIdsSynced[localId] = true;
                this.syncLocalApplianceDown(localId, appliancesInState[localId], appliance_from_cloud);
            }
            else {
                // the appliance does not exist locally but it does exist in the cloud.
                // we create it locally.
                localId = Util_1.Util.getUUID();
                this.transferPromises.push(transferAppliances_1.transferAppliances.createLocal(this.actions, {
                    localId: localId,
                    localSphereId: this.localSphereId,
                    cloudData: appliance_from_cloud
                })
                    .then(() => {
                    this._copyBehaviourFromCloud(localId, appliance_from_cloud);
                })
                    .catch(() => { }));
            }
            cloudIdMap[appliance_from_cloud.id] = localId;
        });
        this.globalSphereMap.appliances = Object.assign({}, this.globalSphereMap.appliances, cloudIdMap);
        this.globalCloudIdMap.appliances = Object.assign({}, this.globalCloudIdMap.appliances, cloudIdMap);
        return localApplianceIdsSynced;
    }
    syncUp(store, appliancesInState, localApplianceIdsSynced) {
        let localApplianceIds = Object.keys(appliancesInState);
        localApplianceIds.forEach((applianceId) => {
            let appliance = appliancesInState[applianceId];
            this.syncLocalApplianceUp(store, appliance, applianceId, localApplianceIdsSynced[applianceId] === true);
        });
    }
    syncLocalApplianceUp(store, localAppliance, localApplianceId, hasSyncedDown = false) {
        // if the object does not have a cloudId, it does not exist in the cloud but we have it locally.
        if (!hasSyncedDown) {
            if (localAppliance.config.cloudId) {
                this.actions.push({ type: 'REMOVE_APPLIANCE', sphereId: this.localSphereId, applianceId: localApplianceId });
                // We also need to make sure all items currently using this appliance will propagate the removal of this item.
                this.propagateRemoval(store, localApplianceId);
            }
            else {
                if (!PermissionManager_1.Permissions.inSphere(this.localSphereId).canCreateAppliances) {
                    return;
                }
                this.transferPromises.push(transferAppliances_1.transferAppliances.createOnCloud(this.actions, {
                    localId: localApplianceId,
                    localSphereId: this.localSphereId,
                    cloudSphereId: this.cloudSphereId,
                    localData: localAppliance
                })
                    .then((cloudId) => {
                    this.globalCloudIdMap.appliances[cloudId] = localApplianceId;
                }));
            }
        }
    }
    propagateRemoval(store, localApplianceId) {
        let state = store.getState();
        let sphere = state.spheres[this.localSphereId];
        if (!sphere) {
            return;
        } // the sphere does not exist yet. In that case we do not need to propagate.
        let stones = sphere.stones;
        let stoneIds = Object.keys(stones);
        let actions = [];
        stoneIds.forEach((stoneId) => {
            if (stones[stoneId].config.applianceId === localApplianceId) {
                actions.push({ type: 'UPDATE_STONE_CONFIG', sphereId: this.localSphereId, stoneId: stoneId, data: { applianceId: null } });
            }
        });
        if (actions.length > 0) {
            store.batchDispatch(actions);
        }
    }
    syncLocalApplianceDown(localId, applianceInState, appliance_from_cloud) {
        // determine the linked location id
        if (syncUtil_1.shouldUpdateInCloud(applianceInState.config, appliance_from_cloud)) {
            if (!PermissionManager_1.Permissions.inSphere(this.localSphereId).canUploadAppliances) {
                return;
            }
            this.transferPromises.push(transferAppliances_1.transferAppliances.updateOnCloud({
                localId: localId,
                localData: applianceInState,
                localSphereId: this.localSphereId,
                cloudId: appliance_from_cloud.id,
                cloudSphereId: this.cloudSphereId,
            })
                .catch(() => { }));
        }
        else if (syncUtil_1.shouldUpdateLocally(applianceInState.config, appliance_from_cloud)) {
            this.transferPromises.push(transferAppliances_1.transferAppliances.updateLocal(this.actions, {
                localSphereId: this.localSphereId,
                localId: localId,
                cloudId: appliance_from_cloud.id,
                cloudData: appliance_from_cloud
            }).catch(() => { }));
        }
        if (!applianceInState.config.cloudId) {
            this.actions.push({ type: 'UPDATE_APPLIANCE_CLOUD_ID', sphereId: this.localSphereId, applianceId: localId, data: { cloudId: appliance_from_cloud.id } });
        }
    }
    ;
    _getCloudIdMap(appliancesInState) {
        let cloudIdMap = {};
        let applianceIds = Object.keys(appliancesInState);
        applianceIds.forEach((applianceId) => {
            let appliance = appliancesInState[applianceId];
            if (appliance.config.cloudId) {
                cloudIdMap[appliance.config.cloudId] = applianceId;
            }
        });
        return cloudIdMap;
    }
    _searchForLocalMatch(appliancesInState, applianceInCloud) {
        let applianceIds = Object.keys(appliancesInState);
        for (let i = 0; i < applianceIds.length; i++) {
            if (applianceIds[i] === applianceInCloud.id) {
                return applianceIds[i];
            }
        }
        return null;
    }
    _copyBehaviourFromCloud(localId, appliance_from_cloud) {
        // we only download the behaviour the first time we add the stone.
        if (appliance_from_cloud.json !== undefined) {
            let behaviour = JSON.parse(appliance_from_cloud.json);
            if (behaviour.onHomeEnter)
                this.actions.push({ type: 'UPDATE_APPLIANCE_BEHAVIOUR_FOR_onHomeEnter', sphereId: this.localSphereId, applianceId: localId, data: behaviour.onHomeEnter });
            if (behaviour.onHomeExit)
                this.actions.push({ type: 'UPDATE_APPLIANCE_BEHAVIOUR_FOR_onHomeExit', sphereId: this.localSphereId, applianceId: localId, data: behaviour.onHomeExit });
            if (behaviour.onRoomEnter)
                this.actions.push({ type: 'UPDATE_APPLIANCE_BEHAVIOUR_FOR_onRoomEnter', sphereId: this.localSphereId, applianceId: localId, data: behaviour.onRoomEnter });
            if (behaviour.onRoomExit)
                this.actions.push({ type: 'UPDATE_APPLIANCE_BEHAVIOUR_FOR_onRoomExit', sphereId: this.localSphereId, applianceId: localId, data: behaviour.onRoomExit });
            if (behaviour.onNear)
                this.actions.push({ type: 'UPDATE_APPLIANCE_BEHAVIOUR_FOR_onNear', sphereId: this.localSphereId, applianceId: localId, data: behaviour.onNear });
            if (behaviour.onAway)
                this.actions.push({ type: 'UPDATE_APPLIANCE_BEHAVIOUR_FOR_onAway', sphereId: this.localSphereId, applianceId: localId, data: behaviour.onAway });
        }
    }
    ;
}
exports.ApplianceSyncer = ApplianceSyncer;
//# sourceMappingURL=ApplianceSyncer.js.map