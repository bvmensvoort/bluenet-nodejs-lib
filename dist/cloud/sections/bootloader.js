"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DeviceInfo = require('react-native-device-info');
exports.bootloader = {
    getBootloaderDetails: function (version, hardwareVersion, background = true) {
        return this._setupRequest('GET', '/Bootloaders?version=' + version + '&hardwareVersion=' + hardwareVersion, { background: background });
    },
    getLatestAvailableBootloader: function (background = true) {
        let appVersionArray = DeviceInfo.getReadableVersion().split(".");
        if (Array.isArray(appVersionArray) && appVersionArray.length >= 3) {
            let appVersion = appVersionArray[0] + '.' + appVersionArray[1] + '.' + appVersionArray[2];
            return this._setupRequest('GET', '/Bootloaders/latest?appVersion=' + appVersion, { background: background });
        }
        else {
            return new Promise((resolve, reject) => { reject("Can't get app version correctly."); });
        }
    },
};
//# sourceMappingURL=bootloader.js.map