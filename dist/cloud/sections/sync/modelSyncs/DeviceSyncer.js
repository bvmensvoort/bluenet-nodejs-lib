"use strict";
/**
 * Sync schedules in this stone.
 * @param actions
 * @param transferPromises
 * @param state
 * @param cloudSpheresData
 * @param sphere
 * @param stone_from_cloud
 * @param cloudScheduleIds
 * @param sphereInState
 */
Object.defineProperty(exports, "__esModule", { value: true });
const react_native_1 = require("react-native");
const Util_1 = require("../../../../util/Util");
const SyncingBase_1 = require("./SyncingBase");
const cloudAPI_1 = require("../../../cloudAPI");
const Log_1 = require("../../../../logging/Log");
const ExternalConfig_1 = require("../../../../ExternalConfig");
class DeviceSyncer extends SyncingBase_1.SyncingBase {
    download() {
        return cloudAPI_1.CLOUD.forUser(this.userId).getDevices();
    }
    sync(state) {
        this.userId = state.user.userId;
        return this.download()
            .then((devicesInCloud) => {
            this._constructLocalIdMap();
            this.syncDown(state, state.devices, devicesInCloud);
            this.syncUp(state, state.devices, devicesInCloud);
            return Promise.all(this.transferPromises);
        });
    }
    syncUp(state, devicesInState, devicesInCloud) {
        // cleanup
        let cloudDeviceIdList = {};
        for (let i = 0; i < devicesInCloud.length; i++) {
            cloudDeviceIdList[devicesInCloud[i].id] = true;
        }
        let deviceIds = Object.keys(devicesInState);
        for (let i = 0; i < deviceIds.length; i++) {
            let device = devicesInState[deviceIds[i]];
            if (cloudDeviceIdList[device.cloudId] === undefined) {
                this.actions.push({ type: 'REMOVE_DEVICE', deviceId: deviceIds[i] });
            }
        }
    }
    syncDown(state, devicesInState, devicesInCloud) {
        // get local device Info:
        let specs = Util_1.Util.data.getDeviceSpecs(state);
        // find matching local device
        let matchingSpecs = this._findMatchingDeviceInCloud(specs, devicesInCloud);
        // device is not in the cloud!
        if (matchingSpecs.id === undefined) {
            this._createNewDeviceInCloud(specs, state);
        }
        else if (state.devices[matchingSpecs.id] === undefined) {
            // download device data and store locally.
            this._createNewDeviceLocally(state, specs, matchingSpecs);
            this.globalCloudIdMap.devices[matchingSpecs.id] = matchingSpecs.id;
        }
        else {
            // this
            this._updateLocalDevice(state, specs, devicesInState[matchingSpecs.id], matchingSpecs);
            this.globalCloudIdMap.devices[matchingSpecs.id] = matchingSpecs.id;
        }
    }
    _createNewDeviceInCloud(specs, state) {
        let newDevice = null;
        Log_1.LOG.info("Sync: Create new device in cloud", specs.name, specs.address, specs.description);
        let deviceInfo = {
            name: specs.name,
            address: specs.address,
            description: specs.description,
        };
        if (state.user.uploadDeviceDetails) {
            deviceInfo["os"] = specs.os;
            deviceInfo["deviceType"] = specs.deviceType;
            deviceInfo["userAgent"] = specs.userAgent;
            deviceInfo["model"] = specs.model;
            deviceInfo["locale"] = specs.locale;
        }
        this.transferPromises.push(cloudAPI_1.CLOUD.createDevice(deviceInfo)
            .then((device) => {
            newDevice = device;
            return cloudAPI_1.CLOUD.forDevice(device.id).createInstallation({
                deviceType: react_native_1.Platform.OS,
            });
        })
            .then((installation) => {
            this.actions.push({
                type: 'ADD_INSTALLATION',
                installationId: installation.id,
                data: { deviceToken: null }
            });
            this.actions.push({
                type: 'ADD_DEVICE',
                deviceId: newDevice.id,
                data: {
                    name: specs.name,
                    address: specs.address,
                    description: specs.description,
                    os: specs.os,
                    model: specs.model,
                    deviceType: specs.deviceType,
                    userAgent: specs.userAgent,
                    locale: specs.locale,
                    installationId: installation.id
                }
            });
            this.globalCloudIdMap.devices[newDevice.id] = newDevice.id;
            // We now push the location of ourselves to the cloud.
            this._updateUserLocationInCloud(state, newDevice.id);
        }));
    }
    _updateLocalDevice(state, specs, localDevice, matchingSpecs) {
        let installationId = this._getInstallationIdFromDevice(matchingSpecs.deviceInCloud.installations);
        // if the device is known under a different number in the cloud, we update our local identifier
        if (specs.address !== matchingSpecs.address) {
            this.actions.push({
                type: 'SET_APP_IDENTIFIER',
                data: { appIdentifier: matchingSpecs.address }
            });
        }
        // Old bug caused the local db to have a device address of null. This should fix that.
        if (localDevice.address !== matchingSpecs.address) {
            Log_1.LOG.info("Sync: update address to", matchingSpecs.address);
            this.actions.push({
                type: "UPDATE_DEVICE_CONFIG",
                deviceId: matchingSpecs.id,
                data: {
                    name: specs.name,
                    address: matchingSpecs.address,
                    description: specs.description,
                    cloudId: matchingSpecs.id,
                    os: specs.os,
                    model: specs.model,
                    deviceType: specs.deviceType,
                    userAgent: specs.userAgent,
                    locale: specs.locale,
                    hubFunction: matchingSpecs.deviceInCloud.hubFunction,
                }
            });
        }
        // if the tap to toggle calibration is available and different from what we have stored, update it.
        if (matchingSpecs.deviceInCloud.tapToToggleCalibration && localDevice.tapToToggleCalibration === null) {
            this.actions.push({
                type: 'SET_TAP_TO_TOGGLE_CALIBRATION',
                deviceId: matchingSpecs.id,
                data: {
                    tapToToggleCalibration: matchingSpecs.deviceInCloud.tapToToggleCalibration
                }
            });
        }
        Log_1.LOG.info("Sync: User device found in cloud, updating installation: ", installationId);
        this._verifyInstallation(state, matchingSpecs.id, installationId);
    }
    _createNewDeviceLocally(state, specs, matchingSpecs) {
        Log_1.LOG.info("Sync: User device found in cloud, updating local.");
        let installationId = this._getInstallationIdFromDevice(matchingSpecs.deviceInCloud.installations);
        // add the device from the cloud to the redux database
        this.actions.push({
            type: 'ADD_DEVICE',
            deviceId: matchingSpecs.id,
            data: {
                name: specs.name,
                address: matchingSpecs.address,
                description: specs.description,
                os: specs.os,
                model: specs.model,
                cloudId: matchingSpecs.id,
                deviceType: specs.deviceType,
                userAgent: specs.userAgent,
                locale: specs.locale,
                installationId: installationId,
                tapToToggleCalibration: matchingSpecs.deviceInCloud.tapToToggleCalibration,
                hubFunction: matchingSpecs.deviceInCloud.hubFunction,
            }
        });
        // update our unique identifier to match the new device.
        this.actions.push({
            type: 'SET_APP_IDENTIFIER',
            data: { appIdentifier: matchingSpecs.address }
        });
        this._verifyInstallation(state, matchingSpecs.id, installationId);
        // We now push the location of ourselves to the cloud.
        this._updateUserLocationInCloud(state, matchingSpecs.id);
    }
    _verifyInstallation(state, deviceId, installationId) {
        if (installationId) {
            this.transferPromises.push(cloudAPI_1.CLOUD.getInstallation(installationId)
                .then((installation) => {
                this.actions.push({
                    type: 'ADD_INSTALLATION',
                    installationId: installation.id,
                    data: { deviceToken: installation.deviceToken }
                });
            }));
        }
        else if (deviceId && state && state.devices && state.devices[deviceId] && state.devices[deviceId].installationId === null) {
            this.transferPromises.push(cloudAPI_1.CLOUD.forDevice(deviceId).createInstallation({ deviceType: react_native_1.Platform.OS })
                .then((installation) => {
                this.actions.push({
                    type: 'ADD_INSTALLATION',
                    installationId: installation.id,
                    data: { deviceToken: null }
                });
                this.actions.push({
                    type: 'UPDATE_DEVICE_CONFIG',
                    deviceId: deviceId,
                    data: { installationId: installation.id }
                });
            }));
        }
    }
    _getCloudLocationId(localId) {
        if (!localId) {
            return null;
        }
        return this.globalLocalIdMap.locations[localId];
    }
    _getCloudSphereId(localId) {
        if (!localId) {
            return null;
        }
        return this.globalLocalIdMap.spheres[localId];
    }
    _updateUserLocationInCloud(state, deviceId) {
        if (state.user.uploadLocation === true) {
            if (state.user.userId) {
                let userLocation = Util_1.Util.data.getUserLocation(state, state.user.userId);
                let cloudLocationId = this._getCloudLocationId(userLocation.locationId);
                let cloudSphereId = this._getCloudSphereId(userLocation.sphereId);
                this.transferPromises.push(cloudAPI_1.CLOUD
                    .forDevice(deviceId)
                    .updateDeviceLocation(cloudLocationId)
                    .catch((err) => {
                    Log_1.LOG.error("DeviceSyncer: Failed to set device location in cloud :userLocation", userLocation, "cloudLocationId:", cloudLocationId, err);
                }));
                this.transferPromises.push(cloudAPI_1.CLOUD
                    .forDevice(deviceId)
                    .updateDeviceSphere(cloudSphereId)
                    .catch((err) => {
                    Log_1.LOG.error("DeviceSyncer: Failed to set device sphere in cloud :userLocation", userLocation, "cloudSphereId:", cloudSphereId, err);
                }));
            }
        }
    }
    ;
    _findMatchingDeviceInCloud(localDeviceSpecs, devicesInCloud) {
        let deviceId = undefined;
        let address = localDeviceSpecs.address;
        let matchingDevice = undefined;
        for (let i = 0; i < devicesInCloud.length; i++) {
            let cloudDevice = devicesInCloud[i];
            if (cloudDevice.address === localDeviceSpecs.address) {
                deviceId = cloudDevice.id;
                matchingDevice = cloudDevice;
                break;
            }
            else if (cloudDevice.name === localDeviceSpecs.name && cloudDevice.description === localDeviceSpecs.description) {
                deviceId = cloudDevice.id;
                address = cloudDevice.address;
                matchingDevice = cloudDevice;
            }
            else if (cloudDevice.description === localDeviceSpecs.description) {
                deviceId = cloudDevice.id;
                address = cloudDevice.address;
                matchingDevice = cloudDevice;
            }
        }
        return { id: deviceId, address: address, deviceInCloud: matchingDevice };
    }
    _getInstallationIdFromDevice(installations) {
        if (installations && Array.isArray(installations) && installations.length > 0) {
            for (let i = 0; i < installations.length; i++) {
                if (installations[i].appName === ExternalConfig_1.APP_NAME) {
                    return installations[i].id;
                }
            }
        }
        return null;
    }
}
exports.DeviceSyncer = DeviceSyncer;
//# sourceMappingURL=DeviceSyncer.js.map