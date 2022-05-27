/** 
 * @version 0.6
 * @status debug
 * 
 * @TODO
 * 1. study how to use HTTPS (over Wi-Fi) on web browser to transfer file
 * 1. backend is needed to deal with file (e.g. MongoDB)
 *  - can be omitted since the firmware data would be discarded after refresh 
 * 2. free web hosting for try to perform firmware update via phone [e.g. GitHub Pages (not including file uploading)]
 * 3. CSS to beauity the layout
 * 
 * @Issue
 * 1. gattServer.connected / bluetoothDevice.gatt.connected is changed to false
 *    (connectivity)
 * 2. cannot upload new firmware on phone (showOpenFilePicker() is not supported on phone)
 * 
 * @changelog
 * ver 0.6
 * - fixed the issue of file path
 *  - use File System Access API instead of fetch()
 * - changed the handler for file selecting
 * 
 * ver 0.5
 * - added breathing LED (auto-intensity changing) feature
 * 
 * ver 0.4
 * - the refresh rate of control gear incrases
*/

const MAX_BRIGHTNESS = 254;
const CONTROL_GEAR_MAX_NUM = 64;
const CONTROL_GEAR_WRAPPED_GROUP_0_ADDRESS  = 240;
const CONTROL_GEAR_WRAPPED_GROUP_15_ADDRESS = 255;

const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_CMD_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const CHARACTERISTIC_DEBUG_UUID = "f973fc77-053f-4892-b650-b3aa1cbb90a6";
const CHARACTERISTIC_FILE_UUID = "c4a2ab77-ff52-42ed-9ae7-1caacf6f03d2";
const DESCRIPTOR_DEBUG_PRINT_UUID = "6d65cd6a-7a7c-4200-b69e-843e045a361e";

const DELAY_1MS = 1;
const BLE_CMD_DAPC_COMMAND                            = " 300 ";
const BLE_CMD_SET_FADE_TIME                           = " 301 ";
const BLE_CMD_SET_FADE_RATE                           = " 302 ";
const BLE_CMD_SET_EXTENDED_FADE_TIME                  = " 303 ";
const BLE_CMD_QUERY_FADE_TIME_AND_RATE                = " 304 ";  
const BLE_CMD_GET_ALL_CONTROL_GEAR_SHORT_ADDRESSES    = " 400 ";
const BLE_CMD_SET_ALL_CONTROL_GEAR_GROUP_ADDRESSES    = " 401 ";
const BLE_CMD_GET_ALL_CONTROL_GEAR_GTIN               = " 402 ";
const BLE_CMD_GET_ALL_CONTROL_GEAR_GROUP_ADDRESSES    = " 403 ";
const BLE_CMD_CONTROL_GEAR_COMMISSIONING              = " 404 ";
const BLE_CMD_GET_MTU_SIZE                            = " 500 ";
const BLE_CMD_BEGIN_FILE_TRANSFER                     = " 501 ";
const BLE_CMD_END_FILE_TRANSFER                       = " 502 ";
const BLE_CMD_FORMAT_SPIFFS                           = " 600 ";
const BLE_CMD_EXIT_INITIALIZATION                     = " 601 ";

const ZERO_ASCII_CODE = 48;
const ESP32_BLE_MTU_SIZE = 512;
const GTIN_WORD_SIZE_IN_BYTES = 13;

const FILE_PICKER_OPTIONS = {
  types:[
    {
      description: "Bin/Hex Dump",
      accept: {
        "bin/hex": ['.bin', '.hex'],
      }
    },
  ],
  excludeAcceptAllOption: true,
  multiple: false
};

var bluetoothDevice;
var bluetoothDeviceGattServer;

var buffer;
var deviceConnected = false;
var ble_characteristic_value_buf;
var characteristic_buffer_value = new ArrayBuffer(20);
var control_gear_short_address = 1; // short address for the command sequence
var availiable_control_gear;  // array of short addresses available of control gear
var ble_mtu_size = 0;

var file_name;
// 2022-05-17 Bryan
// need array of GTIN and group addresses 
var control_gear_group_address;
var control_gear_gtin;

// 2022-05-18 Bryan
// Not recommended to use 
var firmware_update_short_address;
var firmware_update_group_address;
// 2022-05-18 Bryan
var firmware_update_address_word;
var firmware_update_value_word;

// 2022-05-23 Bryan
var fade_time;
var led_breathing_toggle_state = -1;
var led_breathing_interval_id;
var in_breathing = false;
var target_light_level;
var update_latest_info = false;

var firmware_data;

let connectButton = document.getElementById("connect");
let disconnectButton = document.getElementById("disconnect");
let ledOn = document.getElementById("led-on");
let ledOff = document.getElementById("led-off");
let refreshStatus = document.getElementById("refresh-status");
let lightDown = document.getElementById("led-light-down");
let lightUp = document.getElementById("led-light-up");
let led_brightness_slider = document.getElementById("led-brightness-slider");
let read_control_gear = document.getElementById("read-control-gear");
// let control_gear_select_button = document.getElementById(
//   "control-gear-select-button"
// );
let identify_control_gear = document.getElementById("identify-control-gear");
let firmware_update_button = document.getElementById("firmware-update-button");
let file_upload_button = document.getElementById("file-upload-button");
let firmware_update_file = document.getElementById("firmware-update-file");

let firmware_update_short_address_select_button = document.getElementById(
                                          "firmware-update-short-address-selection-button"
                                        );

let firmware_update_group_address_select_button = document.getElementById(
                                          "firmware-update-group-address-selection-button"
                                        );

let firmware_update_type_menu = document.getElementById("firmware-update-type-menu");
let firmware_update_short_address_select_menu = document.getElementById(
                                              "firmware-update-short-address-selection-menu"
                                              );
let firmware_update_group_address_select_menu = document.getElementById(
                                              "firmware-update-group-address-selection-menu"
                                              );
let control_gear_select_menu = document.getElementById("control-gear-select-menu");
let led_brightness_text = document.getElementById("led-brightness"); 
let fade_time_menu = document.getElementById("fade-time-menu");
let enable_fading = document.getElementById("enable-fading");
let disable_fading = document.getElementById("disable-fading");
let led_breathing_button = document.getElementById("led-breathing");
let firmware_update_file_button = document.getElementById("firmware-update-file-button");
let loading_screen = document.getElementById("loading-screen-container");

// DEBUG
let readCharacteristic = document.getElementById("read-ble-characteristic");
let writeCharacteristic = document.getElementById("write-ble-characteristic");
let read_gtin_button = document.getElementById("read-gtin-button");
let set_group_address_button = document.getElementById("set-group-address-button");
let ble_cmd_end_file_transfer_button = document.getElementById("ble-cmd-end-file-transfer-button");
let control_gear_commissioning_button = document.getElementById("control-gear-commissioning-button");

connectButton.addEventListener("click", async function () {
  loading_screen.style.display = "block";
  connect()
  .then((promise) => {
    loading_screen.style.display = "none";
    // GATT operation in progress
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_FILE_UUID)
    .then((characteristic) => {
      characteristic.startNotifications()
      .then((characteristic) => {
        time("wait notification");
      });

      characteristic.addEventListener("characteristicvaluechanged", btFileCharacteristicNotifyHandler);
    });
  })
  .catch((error) => {
    loading_screen.style.display = "none";
  });
  
});

disconnectButton.addEventListener("click", async function () {
  disconnect();
});

refreshStatus.addEventListener("click", async function () {
  // bluetoothDevice.gatt.getPrimaryService(SERVICE_UUID)
  // .then(service =>{
  //     log('>> getting characteristics');
  //     return service.getCharacteristic(CHARACTERISTIC_CMD_UUID);
  // })
  // .then(characteristic =>{
  //     return characteristic.readValue();
  // })

  refreshControlDashboard()
  .then(async (brightness) => {
  });

  await delay_ms(300);

  refreshFadingInfo();
});

ledOn.addEventListener("click", async function () {
  // log("foo");
  log(control_gear_short_address.toString() + " 300 254");
  // set CMD characteristic value
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID).then(
    (characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array(control_gear_short_address.toString() + " 300 254")
      );
      // characteristic.writeValueWithoutResponse(asciiToUint8Array("0 300 254"));
    }
  );
  
  await delay_ms(100);
  target_light_level = MAX_BRIGHTNESS;

  refreshControlDashboard()
  .then((brightness) => {
  });
});

ledOff.addEventListener("click", async function () {
  log("bar");
  log(control_gear_short_address.toString() + " 300 0");
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID).then(
    (characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array(control_gear_short_address.toString() + " 300 0")
      );
      // characteristic.writeValueWithoutResponse(asciiToUint8Array("0 300 0"));
    }
  );

  await delay_ms(100);
  target_light_level = 0;

  refreshControlDashboard()
  .then((brightness) => {
  });
});

readCharacteristic.addEventListener("click", function () {
  // log('> getting gatt service');
  // bluetoothDevice.gatt.getPrimaryService(SERVICE_UUID)
  // .then(service =>{
  //     log('>> getting characteristics');
  //     return service.getCharacteristic(CHARACTERISTIC_CMD_UUID);
  // })
  // .then(characteristic =>{
  //     return characteristic.readValue();
  // })
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_DEBUG_UUID)
    .then((characteristic) => {
      return characteristic.readValue();
    })
    .then((dataview) => {
      log(dataview);
      document.getElementById("ble-characteristics-display-text").innerHTML =
        'Input: "' + new TextDecoder().decode(dataview) + '"';
    });
  // .then(characteristic =>{
  //    log('>>> getting descriptors');
  //    return characteristic.getDescriptors();
  // })
  // .then(descriptors => {
  //     return descriptors[0].readValue();
  // })
  // .then(dataview =>{
  //     log(dataview);
  //     return dataview;
  // })
  // .then(array =>{
  //     log(array);
  //     document.getElementById("ble-descriptor-display-text").innerHTML = "Input: \"" + new TextDecoder().decode(array) + "\"";
  // });
});

writeCharacteristic.addEventListener("click", async function () {
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_DEBUG_UUID)
    .then((characteristic) => {
      return characteristic.writeValue(asciiToUint8Array("debug"));
      // cannot catch promise
    })
    .then((promise) => {
      return promise;
    })
    .then((data) => {
      log(data);
    });
});

lightDown.addEventListener("click", async function () {
  log(asciiToUint8Array(control_gear_short_address.toString() + " 7 0"));

  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID).then(
    (characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array(control_gear_short_address.toString() + " 7 0")
      );
    }
  );

  await delay_ms(100);

  refreshControlDashboard()
  .then((brightness) => {
  });
});

lightUp.addEventListener("click", async function () {
  log(asciiToUint8Array(control_gear_short_address.toString() + " 8 0"));

  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID).then(
    (characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array(control_gear_short_address.toString() + " 8 0")
      );
    }
  );

  await delay_ms(100);

  refreshControlDashboard()
  .then((brightness) => {
  });
});

led_brightness_slider.addEventListener("change", async function () {
  var address_buf = Uint8Array.from(
    asciiToUint8Array(control_gear_short_address.toString())
  );
  var command_buf = Uint8Array.from(asciiToUint8Array(BLE_CMD_DAPC_COMMAND));
  var value_buf = Uint8Array.from(
    asciiToUint8Array(led_brightness_slider.value.toString())
  );
  var data_buf = new Uint8Array(
    address_buf.byteLength + command_buf.byteLength + value_buf.byteLength
  );
  target_light_level = led_brightness_slider.value;
  // CONCAT address, command and value
  data_buf.set(address_buf, 0);
  data_buf.set(command_buf, address_buf.byteLength);
  data_buf.set(value_buf, address_buf.byteLength + command_buf.byteLength);

  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
  .then((characteristic) => {
      characteristic.writeValueWithoutResponse(data_buf);
  });

  await delay_ms(100);

  refreshControlDashboard()
  .then((brightness) => {
  });
});

read_control_gear.addEventListener("click", async function () {
  loading_screen.style.display = "block";
  controlGearCommisioning()
  .then(async (promise) => {
    // read CMD characteristic every 5 seconds
    // till the return value matches the expected
    return isCommissionFinished();
  })
  .then(async (promise) => {
    log("Commissioning completed");
    /**
     * @TODO cannot read the short address(es) after commissioning
     */
    getControlGearPresent()
    .then((num_of_availiable_control_gear) => {
      return num_of_availiable_control_gear;
    })
    .then(async (num_of_availiable_control_gear) => {
      return setAllControlGearGroupAddress()
              .then((promise) => {
                return promise;
              })
    })
    .then(async (promise) => {
      // wait 1 sec to let BLE server ready for next command
      await delay_ms(1000);
      return getAllControlGearGTIN()
      .then((promise) => {
        return promise;
      });
    })
    .then(async (promise) => {
      await delay_ms(1000);
      return getAllControlGearGroupAddress()
              .then((promise) => {
                return promise;
              });
    })
    // change the firmware update short address options
    .then(async (prmoise) => {
      return updateFirmwareUpdateShortAddressMenu()
        .then((promise) => {
          return promise;
        });
    })
    .then(async (promise) => {
      // change the firmware update group address options
      return updateFirmwareUpdateGroupAddressMenu()
        .then((promise) => {
          return promise;
        });
    })
    .then(async (promise) => {
      return new Promise((resolve, reject) => {
        log(availiable_control_gear);
        log(control_gear_group_address);
        log(control_gear_gtin);
        resolve("promise");
      });
    })
    .then((promise) => {
      document.getElementById("selected-control-gear-container").style.display = "block";
      loading_screen.style.display = "none";
    });
  })
  .catch((error) => {
    log(error);
    loading_screen.style.display = "none";
  });
});

// control_gear_select_button.addEventListener("click", function () {
//   readSelectedControlGear()
//   .then((promise) =>{
//     document.getElementById("control-gear-gtin").innerHTML  = "0x" + control_gear_gtin[control_gear_short_address].toString(16).toUpperCase();
//     document.getElementById("control-gear-group-address").innerHTML = control_gear_group_address[control_gear_short_address];
//     document.getElementById(
//       "device-control-dashboard-container"
//     ).style.display = "block";
//   });
// });

identify_control_gear.addEventListener("click", function () {
  identifySelectedControlGear();
});

firmware_update_button.addEventListener("click", async function () {
  // @TODO: add path selection procedure
  //        need to study FILE api
  
  // Fetch the hex file and convert it into ArrayBuffer
  // fetch("./data/" + file_name)
  // .then(async (response) => {
  //   log(response);
  //   var data = response.arrayBuffer();
  //   await delay_ms(1000);
  //   log(data);
  //   return data;
  // })
  // .catch((error) => {
  //   alert(error.message);
  // })

  loading_screen.style.display = "block";
  // replace the fetch method with file system handle
  isValidFile()
  .then(async (data) => {
    // format SPIFFS
    formatSPIFFS(); 
    
    // check the initialization value from CMD characteristic
    // wait for 25s. Device takes around 20s to initalize 
    await delay_ms(25000);

    return reconnect()
    .then(async (resolve) => {
      // get MTU size from the MCU
      return getMTUsize()
      .then(async (promise) => {
        return recoverBusInfoOnBLEServer()
          .then((promise) => {
            /** Divide the data into chunks based on MTU size 
             * expected test result (test.hex): 
             * => 12393 Bytes / (MTU size)
             * => 25 data chunks to transfer the test file
             **/ 
            return divideDataIntoChunks(data, ble_mtu_size);
          });
      });
    })
    .catch((error) => {
      alert("error caught: reconnect");
    });
  })
  .then(async (chunks) => {


    // send cmd to indicate START file transfer 
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      // characteristic.writeValueWithoutResponse(asciiToUint8Array(control_gear_short_address.toString() + " 501 0"));
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array(firmware_update_address.toString() + BLE_CMD_BEGIN_FILE_TRANSFER + (0).toString())
      );
    });

    await delay_ms(300);

    /* Send data chunks */
    log("chunk length: " + chunks.length);
    for(var i = 0; i < chunks.length; i++) {
      getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
      .then((characteristic) => {
        characteristic.writeValueWithResponse(chunks[i]);
        // add loading screen or show alert 
        // also disable other buttons to aviod interrupt
      });
      
      await delay_ms(1000);
    }

    /* Send END transfer command*/
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      // characteristic.writeValueWithoutResponse(asciiToUint8Array(control_gear_short_address.toString() + " 502 0"));
      log("END file transfer");
      return characteristic.writeValueWithResponse(
        asciiToUint8Array(firmware_update_address.toString() + BLE_CMD_END_FILE_TRANSFER + (0).toString())
      );
    })
    .then((promise) => {
      log(promise);

      // getCharacteristic(SERVICE_UUID, CHARACTERISTIC_FILE_UUID)
      // .then((characteristic) => {
      //   characteristic.startNotifications()
      //   .then((characteristic) => {
      //     time("wait notification");
      //   });

      //   characteristic.addEventListener("characteristicvaluechanged", btFileCharacteristicNotifyHandler);
      // });
    });
  });

});

firmware_update_file.addEventListener("change", handleFiles, false);

firmware_update_type_menu.addEventListener("change", function(){
  var dropdown = document.getElementById("firmware-update-type-menu");
  document.get
  document.getElementById("firmware-update-button")
    .style.display = "none";
  // dropdown.value is string (either "short-address" or "group-address")
  log(dropdown.value); 
  log(typeof(dropdown.value));
  if(dropdown.value.startsWith("short")){
    document.getElementById("firmware-update-group-address-selection-container")
      .style.display = "none";
    document.getElementById("firmware-update-short-address-selection-container")
      .style.display = "block";
  }
  else if(dropdown.value.startsWith("group")){
    document.getElementById("firmware-update-short-address-selection-container")
      .style.display = "none";
    document.getElementById("firmware-update-group-address-selection-container")
      .style.display = "block";
  }
  else {
    document.getElementById("firmware-update-short-address-selection-container")
      .style.display = "none";
    document.getElementById("firmware-update-group-address-selection-container")
      .style.display = "none";
  }
})

firmware_update_short_address_select_menu.addEventListener("change", function() {
  var dropdown = document.getElementById("firmware-update-short-address-selection-menu");
  log(dropdown.value);
  log(typeof(dropdown.value));
  // put the dropdown.value in the command sequence to BLE server
  firmware_update_address = firmware_update_short_address = dropdown.value;
  // set firmware_update_group_address to 0
  firmware_update_group_address = "0";
  // show update button
  document.getElementById("firmware-update-button")
    .style.display = "block";
})

firmware_update_group_address_select_menu.addEventListener("change", function() {
  var dropdown = document.getElementById("firmware-update-group-address-selection-menu");
  log(dropdown.value);
  log(typeof(dropdown.value));
  // set firmware_update_short_address to 255, 
  // for conditional statement in parse BLE command sequence
  firmware_update_address = parseInt(dropdown.value) + CONTROL_GEAR_WRAPPED_GROUP_0_ADDRESS;
  
  firmware_update_short_address = "255";
  // dropdown.value => firmware_udate_group_address
  firmware_update_group_address = dropdown.value;
  // show update button
  document.getElementById("firmware-update-button")
  .style.display = "block";
})

control_gear_select_menu.addEventListener("change", async function() {
  loading_screen.style.display = "block";
  var dropdown = document.getElementById("firmware-update-group-address-selection-menu");
  log(dropdown.value);
  log(typeof(dropdown.value));

  readSelectedControlGear()
  .then(async (promise) =>{
    refreshControlDashboard()
    .then((brightness) => {
      return new Promise(async(resolve, reject) => {
        await delay_ms(200);
        refreshFadingInfo()
        .then((promise) => {
          // also refresh the selected option

          document.getElementById("control-gear-gtin").innerHTML  = "0x" + control_gear_gtin[control_gear_short_address].toString(16).toUpperCase();
          document.getElementById("control-gear-group-address").innerHTML = control_gear_group_address[control_gear_short_address];
          // refreshSliderValue(brightness);
          document.getElementById(
            "device-control-dashboard-container"
          ).style.display = "block";
          loading_screen.style.display = "none";
          resolve("ok");
        });
      });
    });
  })
  .catch((error) =>{
    document.getElementById(
      "device-control-dashboard-container"
    ).style.display = "none";
    loading_screen.style.display = "none";
  });
})

fade_time_menu.addEventListener("change", async function(){
  var dropdown = document.getElementById("fade-time-menu");
  var fade_time_code = dropdown.value;
  log(fade_time_code);
  log(typeof(fade_time_code));
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
  .then((characteristic) => {
    characteristic.writeValueWithoutResponse(
      asciiToUint8Array(control_gear_short_address.toString() + BLE_CMD_SET_FADE_TIME + fade_time_code)
    );
  })
  .then(async (promise) => {
    await delay_ms(200);
    refreshFadingInfo();
  })
})

enable_fading.addEventListener("click", function(){
  document.getElementById("fade-time-disabled-container").style.display = "none";
  document.getElementById("fade-time-menu-container").style.display = "block";
})

disable_fading.addEventListener("click", function(){
  document.getElementById("fade-time-menu-container").style.display = "none";
  document.getElementById("fade-time-disabled-container").style.display = "block";
})

led_breathing_button.addEventListener("click", async function(){
  led_breathing_toggle_state *= -1;
  if(led_breathing_toggle_state > 0){
    log("breathing");
    ledBreathing();
  }
  else{
    log("off");
  }
  refreshControlDashboard();
  
})

led_brightness_text.addEventListener("change", function(){
  log("info updated");
})

// DEBUG button. Should merge this rountine to identify devices after gettiing the expected string
set_group_address_button.addEventListener("click", function() {
  setAllControlGearGroupAddress();
})

read_gtin_button.addEventListener("click", function() {
  /**
   * Procedure
   * #1) tell the server to query GTIN from all control gear
   * #1.1) the server get all GTIN & append the result as string
   * #1.2) set the CMD characteristic to the GTIN string
   * #2) get the string 
   **/
  getAllControlGearGTIN();
})

ble_cmd_end_file_transfer_button.addEventListener("click", function() {
  /* Send END transfer command*/
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
  .then((characteristic) => {
    // characteristic.writeValueWithoutResponse(asciiToUint8Array(control_gear_short_address.toString() + " 502 0"));
    log("END file transfer");
    return characteristic.writeValueWithResponse(
      asciiToUint8Array((240).toString() + BLE_CMD_END_FILE_TRANSFER + (0).toString())
    );
  })
  .then((promise) => {
    log(promise);
  });
})

control_gear_commissioning_button.addEventListener("click", function() {
  controlGearCommisioning();
})

firmware_update_file_button.addEventListener("click", function() {
  showOpenFilePicker(FILE_PICKER_OPTIONS)
  .then((array) => {
    log(array);
    array[0].getFile()
    .then((file) => {
      // show the file name next to button
      document.getElementById("firmware-update-file-name").innerText = file.name;

      file.arrayBuffer()
      .then((array_buf) => {
        log(array_buf);
        firmware_data = array_buf;
        document.getElementById("firmware-update-type-container").style.display = "block";
      })
    })
  })
  .catch((error) => {
    document.getElementById("firmware-update-file-name").innerText = "No file chosen";
    firmware_data = null;
  })
})

let deviceCache = null;

async function connect() {
  return new Promise((resolve, reject) => {
    // Connect to the bluetooth device
    requestBluetoothDevice()
    .then((gattServer) => {
      log("Device: " + gattServer.connected);
      if (gattServer.connected) {
        document.getElementById("read-control-gear-container").style.display = "block";
      }
      else {
        alert("Cannot connect the controller. Please turn it off and on.");
        document.getElementById("read-control-gear-container").style.display = "none";
      }
      resolve("promise");
    })
    .catch((error) => {
      log(error);
      document.getElementById("read-control-gear-container").style.display = "none";
      reject(error);
    });
    // // acquire the short addressed control gear on the DALI bus
    // await getControlGearPresent();
  });
}

async function disconnect() {
  // sometimes cannot disconnect device. Review needed.
  loading_screen.style.display = "block";
  gatt_disconnect()
  .then(
    (disconnected) => {
      document.getElementById("read-control-gear-container").style.display = "none";
      document.getElementById("selected-control-gear-container").style.display = "none";
      document.getElementById("device-control-dashboard-container").style.display = "none";

      loading_screen.style.display = "none";
    },
    (error) => {
      if (!bluetoothDevice) {
        log("No need to disconnect.");
      }
      document.getElementById("read-control-gear-container").style.display = "none";
      document.getElementById("selected-control-gear-container").style.display = "none";
      document.getElementById("device-control-dashboard-container").style.display = "none";

      loading_screen.style.display = "none";
    }
  );
}

// 2022-05-13 Bryan
async function reconnect() {
  return new Promise((resolve, reject) => {
    exponentialBackoff(3, 2,
      async function toTry(){
        return new Promise(async(resolve, reject) => {
          time("Try to reconnect with BLE device");
          await bluetoothDeviceGattServer.connect();
          if(bluetoothDeviceGattServer.connected) {
            resolve("connected");
          }
          else{
            reject("cannot connect");
          }
        })
      },
      function success(){
        resolve("> Device: reconnected");
      },
      function fail(){
        reject("Failed to reconnect.");
      }
    );
  })
}

async function requestBluetoothDevice() {
  let options = {
    filters: [{ namePrefix: "ESP32" }],
    optionalServices: [SERVICE_UUID],
  };
  return new Promise((resolve, reject) => {
      log("Requesting bluetooth device...");
      navigator.bluetooth.requestDevice(options)
      .then((bluetoothDeviceObject) => {
        bluetoothDevice = bluetoothDeviceObject;
        // log(bluetoothDevice);
        return bluetoothDevice;
      })
      .then((device) =>{
        log(device);
        gatt_connect(device)
        .then((gattServer) => {
          bluetoothDeviceGattServer = gattServer;
          log("server connceted");
          log(bluetoothDeviceGattServer);
          resolve(gattServer);
        })
        .catch((error) => {
          reject(error);
        });
      })
      .catch((error) => {
        reject(error);
      });
  });
}

async function gatt_connect(device) {
  log("Connecting to Bluetooth Device...");
  return new Promise((resolve, reject) => {
    device.gatt.connect()
    .then((gattServer) => {
      deviceConnected = device.gatt.connected;
      if (deviceConnected == true) {
        log("> Bluetooth Device connected");
        document.getElementById("device-connection-display-status").innerHTML = "Connected";
        resolve(gattServer);
      }
      // blueTooth device object acquired but not connected 
      else{
        /**
         * @TODO
         */
        // try to reconnect instead of do nth
        reconnect()
        .then((promise) => {
          resolve("(re)connected");
        })
        // if still cannot connect to the device, alert the user to restart the BLE server
        .catch((error) => {
          reject("Cannot connect to BLE device");
        });
      }
    })
    .catch((error) => {
      reject(error);
    });
  })
}

async function gatt_disconnect() {
  return new Promise(async (resolve, reject) => {
    log("Disconnecting from Bluetooth Device...");
    if(bluetoothDeviceGattServer == null){
      log("Bluetooth server object does not exist");
      reject("error");
    }
    else{
      bluetoothDeviceGattServer.disconnect();
      bluetoothDevice = null;
      await delay_ms(1000);
      log("> Bluetooth Device disconnected.");
      document.getElementById("device-connection-display-status").innerHTML = "Disconnected";
      resolve("disconnected");
    }
  });
}

async function getService(service_uuid) {
  log("> getting gatt service");
  return new Promise((resolve, reject) => {
    // Connected properties may be FALSE since the instance is copied during the gattServer.connect() process
    return bluetoothDeviceGattServer.getPrimaryService(service_uuid)
      .then((service) => {
        resolve(service);
      })
      .catch((error) =>{
        // log("GATT Server is disconnected.");
        alert(error);
        document.getElementById("device-connection-display-status").innerHTML = "Disconnected";
        document.getElementById("control-panel-container").style.display = "none";
        reject(error);
      });
  });
}

function getCharacteristic(service_uuid, characteristic_uuid) {
  return new Promise((resolve, reject) =>{
    getService(service_uuid)
    .then((service) => {
      log(">> getting characteristics");
      return service.getCharacteristic(characteristic_uuid)
        .then((characteristic) => {
          resolve(characteristic);
        })
        .catch((error) => {
          reject(error);
        });
    })
    .catch((error) => {
      reject(error);
    });
  });
}

function getDescriptor(service_uuid, characteristic_uuid, descriptor_uuid) {
  return getCharacteristic(service_uuid, characteristic_uuid).then(
    (characteristic) => {
      log(">>> getting descriptor");
      return characteristic.getDescriptor(descriptor_uuid)
        .then((descriptor) =>{
          return descriptor;
        })
    }
  );
}

function change_led_status_text(brightness) {
  if (brightness && brightness > 0) {
    document.getElementById("led-status").innerHTML = "ON";
  } else {
    document.getElementById("led-status").innerHTML = "OFF";
  }
}

function log(data) {
  console.log(data);
}

function delay_ms(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asciiToUint8Array(str) {
  var chars = [];
  // DEBUG
  log("Write msg length: " + str.length);
  
  for (var i = 0; i < str.length; ++i) {
    chars.push(str.charCodeAt(i));
  }
  return new Uint8Array(chars);
}

async function refreshControlDashboard() {
  return new Promise(async (resolve, reject) => {
    if(!in_breathing){
      loading_screen.style.display = "block";
    }
    // Ask ESP32 for actual brightness
    // hardcode short address as 0x00 first
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID).then(
      (characteristic) => {
        return characteristic.writeValueWithoutResponse(
          asciiToUint8Array(control_gear_short_address.toString() + " 160 0")
        );
      }
    );
    
    // 2022-05-27 Bryan
    // DEBUG: Increase the waiting time, so that the response should not be empty
    await delay_ms(300);

    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
      .then((characteristic) => {
        return characteristic.readValue();
      })
      .then((dataview) => {
        log(dataview);
        var brightness = dataview.getUint8(0);
        change_led_status_text(brightness);
        document.getElementById("led-brightness").innerHTML =
          parseInt((brightness * 100) / MAX_BRIGHTNESS) +
          "% (Val: " +
          brightness +
          ")";

        if(in_breathing && brightness != target_light_level){
          setTimeout(refreshControlDashboard, 500 /* ms */);
        }
        led_brightness_slider.value = brightness;
        if(!in_breathing){
          loading_screen.style.display = "none";
        }
        resolve(brightness);
      });
  });
}

async function getControlGearPresent() {
  return new Promise(async(resolve, reject) => {
    // clear all options in control gear drop down menu
    document.getElementById("control-gear-select-menu").innerHTML = "";

    var drop_down_menu_option = document.createElement("option");
    drop_down_menu_option.id = "";
    drop_down_menu_option.textContent = "";
    drop_down_menu_option.value = "";
    document
      .getElementById("control-gear-select-menu")
      .appendChild(drop_down_menu_option);

    /**
     * @TODO clear all options in firmware update short address
     */

    /**
     * @TODO clear all options in firwmare udpate group address (with GTIN)
     */

    // send command to ESP32 DALI gateway
    log("Ask ESP32 to scan through network, find all short address(es)");
    await delay_ms(100);
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      return characteristic.writeValueWithoutResponse(
        // asciiToUint8Array("0 400 0")
        asciiToUint8Array((0).toString() + BLE_CMD_GET_ALL_CONTROL_GEAR_SHORT_ADDRESSES + (0).toString())
      );
    });

    // scan through the network require ~3.047s on MCU
    // changed 
    await delay_ms(3200);

    log("Read the reply");
    await delay_ms(100);

    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      return characteristic.readValue();
    })
    .then((dataview) => {
      log("dataview");
      log(dataview);
      return new TextDecoder().decode(dataview);
    })
    .then((str_buf) => {
      /* parse string into word, then convert string to Uint8Array */
      var start_index = -1;
      var end_index = start_index;
      var sliced_word_buf = new Array();
      for (var i = 0; i < str_buf.length; i++) {
        end_index = i;
        if (str_buf[i] == " " || i == str_buf.length - 1) {
          // DEBUG
          // log("start index: " + start_index);
          // log("end index: " + end_index);
          sliced_word_buf.push(str_buf.slice(start_index + 1, end_index));
          start_index = i;
        }
      }
      
      // DEBUG
      // log(sliced_word_buf);

      availiable_control_gear = new Array();
      for (var i = 0; i < sliced_word_buf.length; i++) {
        availiable_control_gear.push(parseInt(sliced_word_buf[i]));
      }
      /* parse END */

      return availiable_control_gear;
    })
    .then((availiable_control_gear) =>{
      // append each item in array to dropdown menu
      var drop_down_menu_option;
      var option_index = 0;
      for (var i = 0; i < availiable_control_gear.length; i++) {
        drop_down_menu_option = document.createElement("option");
        drop_down_menu_option.id = "option-" + option_index;
        drop_down_menu_option.textContent = availiable_control_gear[i];
        drop_down_menu_option.value = availiable_control_gear[i];
        document
          .getElementById("control-gear-select-menu")
          .appendChild(drop_down_menu_option);

        option_index = option_index + 1;
      }

      resolve(availiable_control_gear.length);
    });
  });
  
}

function readSelectedControlGear() {
  return new Promise(function(resolve, reject) {
    var dropdown = document.getElementById("control-gear-select-menu");
    log(dropdown.value);
    control_gear_short_address = dropdown.value;
    if(dropdown.value == ""){
      // alert("Please identify control gear(s) on bus first");
      reject("no address is selected");
    }
    else{
      resolve("control gear selected");
    }
  })
}

async function identifySelectedControlGear() {
  log("send identify me CMD");
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
  .then((characteristic) => {
      return characteristic.writeValueWithoutResponse(
        asciiToUint8Array(control_gear_short_address.toString() + " 37 0")
      );
  })
  .then(async (promise) => {
    await delay_ms(300);
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      return characteristic.writeValueWithoutResponse(
        asciiToUint8Array(control_gear_short_address.toString() + BLE_CMD_DAPC_COMMAND + MAX_BRIGHTNESS.toString())
      );
    })
    .then(async(promise) => {
      await delay_ms(2000);
      getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
      .then((characteristic) => {
        return characteristic.writeValueWithoutResponse(
          asciiToUint8Array(control_gear_short_address.toString() + BLE_CMD_DAPC_COMMAND + (0).toString())
        );
      });
    });
  });
}

async function getMTUsize() {
  return new Promise(async (resolve) => {
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      characteristic.writeValueWithoutResponse(
        // asciiToUint8Array(control_gear_short_address.toString() + " 500 0");
        asciiToUint8Array(control_gear_short_address.toString() + BLE_CMD_GET_MTU_SIZE + (0).toString())
      );
    });
  
    await delay_ms(2000);
  
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      return characteristic.readValue();
    })
    .then((dataview) => {
      log(dataview);
      return new TextDecoder().decode(dataview);
    })
    .then((str_buf) => {
      str_buf = str_buf.slice(0, str_buf.length);
      ble_mtu_size = parseInt(str_buf);
    });
  
    await delay_ms(2000);
  
    log("BLE MTU size: " + ble_mtu_size);
    resolve(ble_mtu_size);
  });
}

function divideDataIntoChunks(data, ble_mtu_size){
  log("data size: " + data.byteLength);
  log("MTU: " + ble_mtu_size);
  
  // data: ArrayBuffer

  // determine number of chunk(s) required
  var num_of_chunk = Math.ceil(data.byteLength / ble_mtu_size); 
  // determine the last data chunk's size
  var last_data_chunk_size = data.byteLength % ble_mtu_size;
  var data_chunk_array = new Array(num_of_chunk);

  var i = 0;
  for(i = 0; i < num_of_chunk - 1; i++){
    var start_index = ble_mtu_size * i;
    var end_index = ble_mtu_size * (i + 1);
    log("start index: " + start_index);
    log("end index: " + end_index);
    var data_chunk_content_buf = new ArrayBuffer(ble_mtu_size);
    data_chunk_content_buf = data.slice((ble_mtu_size * i), (ble_mtu_size * (i + 1)));
    log(data_chunk_content_buf);
    data_chunk_array[i] = data_chunk_content_buf;
  }
  data_chunk_array[i] = data.slice((ble_mtu_size * i), (ble_mtu_size * i + last_data_chunk_size));
  
  log(data_chunk_array);

  return data_chunk_array;
}

function formatSPIFFS() {
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
  .then((characteristic) =>{
    characteristic.writeValueWithoutResponse(
      /* only command word is meaningful, address word and value word are discarded */
      asciiToUint8Array((0).toString() + BLE_CMD_FORMAT_SPIFFS + (0).toString())
    );
  });
}

function isDeviceReady(){
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      return characteristic.readValue();
    })
    .then((dataview) => {
      var str_buf = TextDecoder().decode(dataview);
      log("Received: " + str_buf);
      // remove null character at the end of the string
      return parseInt(str_buf.slice(0, str_buf - 1));
    })
    .then((value) => {
      if(value == 254){
        log("Device ready");
        return 1;
      }
      else{
        log("Device is erasing SPI Flash / initializating");
        return 0;
      }
    });
}

async function setAllControlGearGroupAddress(){
  return new Promise(async(resolve, reject) => {
    // 2022-05-16 Bryan
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array((0).toString() + BLE_CMD_SET_ALL_CONTROL_GEAR_GROUP_ADDRESSES + (0).toString())
      )
      .then((promise) => {
        resolve("group addresses have been set");
      });
    });
  });
}

async function getAllControlGearGTIN(){
  return new Promise(async(resolve, reject) => {
    await getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    // tell MCU to prepare all GTIN 
    .then((characteristic) => {
      return characteristic.writeValueWithoutResponse(
        asciiToUint8Array((0).toString() + BLE_CMD_GET_ALL_CONTROL_GEAR_GTIN + (0).toString())
      );
      // write completed
    })
    .then(async (promise) =>{
      // wait for 1 sec for reply ready
      await delay_ms(1000);
      // read reply
      getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
      .then((characteristic) => {
        return characteristic.readValue();
      })
      .then((dataview) => {
        log("dataview");
        log(dataview);
        // the maximum size = 448 Bytes (64 GTINs, separated by space character. last byte should be space character)
        return new TextDecoder().decode(dataview);
      })
      .then((str_buf) => {
        var i = 0;
        log("str buf length: " + str_buf.length);
        var num_of_word = Math.ceil(str_buf.length / GTIN_WORD_SIZE_IN_BYTES);
        log("Number of GTIN: " + num_of_word);

        // reset the array
        control_gear_gtin = new Array();

        while(i < (num_of_word * GTIN_WORD_SIZE_IN_BYTES)){
          control_gear_gtin.push((parseInt(str_buf.slice(i, (i + GTIN_WORD_SIZE_IN_BYTES - 1)), 16)));
          i = i + GTIN_WORD_SIZE_IN_BYTES;
        }
        resolve("Get GTIN");
      });
    });
  });
}

async function getAllControlGearGroupAddress(){
  return new Promise(async (resolve, reject) => {
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array((0).toString() + BLE_CMD_GET_ALL_CONTROL_GEAR_GROUP_ADDRESSES + (0).toString())
      );
      // write completed
    })
    .then(async(promise) => {
      // wait for 1 sec for device ready
      await delay_ms(1000);
      // get reply
      getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
      .then((characteristic) => {
        return characteristic.readValue();
      })
      .then((dataview) => {
        return new TextDecoder().decode(dataview);
      })
      .then((str_buf) => {
        /* parse string into word, then convert string to Uint8Array */
        var start_index = -1;
        var end_index = start_index;
        control_gear_group_address = new Array();
        for (var i = 0; i < str_buf.length; i++) {
          end_index = i;
          if (str_buf[i] == " " || i == str_buf.length - 1) {
            // DEBUG
            // log("start index: " + start_index);
            // log("end index: " + end_index);
            control_gear_group_address.push(parseInt(str_buf.slice(start_index + 1, end_index)));
            start_index = i;
          }
        }
        log(control_gear_group_address);
        log("hi there");
        resolve("Get gorup address");
      })
    });
  })
}

async function updateFirmwareUpdateShortAddressMenu(){
  return new Promise(async(resolve, reject) => {
    document.getElementById("firmware-update-short-address-selection-menu").innerHTML = "";

    // create a blank option for "change" event handling when no item is selected
    var drop_down_menu_option = document.createElement("option");
    drop_down_menu_option.id = "";
    drop_down_menu_option.textContent = "";
    drop_down_menu_option.value = "";
    document
      .getElementById("firmware-update-short-address-selection-menu")
      .appendChild(drop_down_menu_option);

    // refresh options in dropdown menu
    // short address(es) are stored in array availiable_control_gear
    var drop_down_menu_option;
    var option_index = 0;
    for (var i = 0; i < availiable_control_gear.length; i++) {
      drop_down_menu_option = document.createElement("option");
      drop_down_menu_option.id = "option-" + option_index;
      drop_down_menu_option.textContent = availiable_control_gear[i];
      drop_down_menu_option.value = availiable_control_gear[i];
      document
        .getElementById("firmware-update-short-address-selection-menu")
        .appendChild(drop_down_menu_option);

      option_index = option_index + 1;
    }

    resolve("firmware update short address menu updated");
  });
}

async function updateFirmwareUpdateGroupAddressMenu(){
  return new Promise(async(resolve, reject) => {
    // create a blank option for "change" event handling when no item is selected
    document.getElementById("firmware-update-group-address-selection-menu").innerHTML = "";

    var drop_down_menu_option = document.createElement("option");
    drop_down_menu_option.id = "";
    drop_down_menu_option.textContent = "";
    drop_down_menu_option.value = "";
    document
      .getElementById("firmware-update-group-address-selection-menu")
      .appendChild(drop_down_menu_option);

    //refresh options in dropdown menu
    var drop_down_menu_option;
    var option_index = 0;
    for (var i = 0; i < control_gear_group_address.length; i++) {
      drop_down_menu_option = document.createElement("option");
      drop_down_menu_option.id = "option-" + option_index;
      drop_down_menu_option.textContent = control_gear_group_address[i] + " (0x" + control_gear_gtin[i].toString(16).toUpperCase() + ")";
      drop_down_menu_option.value = control_gear_group_address[i];
      document
        .getElementById("firmware-update-group-address-selection-menu")
        .appendChild(drop_down_menu_option);

      option_index = option_index + 1;
    }

    resolve("firmware update group address menu updated");
  });
}

async function recoverBusInfoOnBLEServer() {
  return new Promise(async(resolve, reject) => {
    // let the BLE server get the required bus info first
    // All data on the server side have been erased after formmating SPIFFS
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      return characteristic.writeValueWithoutResponse(
        // asciiToUint8Array("0 400 0")
        asciiToUint8Array((0).toString() + BLE_CMD_GET_ALL_CONTROL_GEAR_SHORT_ADDRESSES + (0).toString())
      );
    });

    // scan through the network require ~3.047s on MCU
    await delay_ms(3200);

    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array((0).toString() + BLE_CMD_SET_ALL_CONTROL_GEAR_GROUP_ADDRESSES + (0).toString())
      )
    });

    await delay_ms(1000);

    resolve("BLE server recovers the bus info");
  });
}

/* From https://googlechrome.github.io/samples/web-bluetooth/automatic-reconnect-async-await.html */
/* Utils */

// This function keeps calling "toTry" until promise resolves or has
// retried "max" number of times. First retry has a delay of "delay" seconds.
// "success" is called upon success.
async function exponentialBackoff(max, delay, toTry, success, fail) {
  try {
    const result = await toTry();
    success(result);
  } catch(error) {
    if (max === 0) {
      return fail();
    }
    time('Retrying in ' + delay + 's... (' + max + ' tries left)');
    setTimeout(function() {
      exponentialBackoff(--max, delay * 2, toTry, success, fail);
    }, delay * 1000);
  }
}

function time(text) {
  log('[' + new Date().toJSON().substr(11, 8) + '] ' + text);
}

function handleFiles() {
  const fileList = this.files;
  // suppose only one file is selected
  file_name = fileList[0].name;
  if(file_name !== "undefined"){ // File is selected
    // show options for user to update (indivdual device / same product)
    log("foo: handle file");
    fileList[0].arrayBuffer()
    .then((array_buf) => {
      firmware_data = array_buf;
      log(firmware_data);
    })
    document.getElementById("firmware-update-type-container").style.display = "block";
    // document.getElementById("firmware-update-short-address-selection-container")
    // document.getElementById("firmware-update-group-address-selection-container")
    // document.getElementById("firmware-update-button").style.display = "block";
  }
  else{
    firmware_data = null;
  }
}

async function controlGearCommisioning(){
  return getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
  .then((characteristic) => {
    return characteristic.writeValueWithoutResponse(
      asciiToUint8Array((0).toString() + BLE_CMD_CONTROL_GEAR_COMMISSIONING + (0).toString())
    );
  });
}

async function isCommissionFinished() {
  return new Promise(async (resolve, reject) => {
    var commissionFinished = false;
    var num_of_entry = 0;
    var entryTime = Date.now();
    // cheange the logic to esacpe by notification
    
    while(!commissionFinished) {
      await delay_ms(5000);
      num_of_entry++;
      getCharacteristic(SERVICE_UUID, CHARACTERISTIC_DEBUG_UUID)
      .then((characteristic) => {
          return characteristic.readValue();
      })
      .then((dataview) => {
        log(dataview);
        return new TextDecoder().decode(dataview);
      })
      .then(async (str_buf) => {
        var num_of_device_found = parseInt(str_buf);
        log(str_buf);
        log(num_of_device_found);
        // alert("Number of device(s) found: " + num_of_device_found);
        if(num_of_device_found == 0){
          reject("no device");
          commissionFinished = true;
        }
        else if(num_of_device_found >= 1 && num_of_device_found <= 64){
          commissionFinished = true;
          await delay_ms(5000 * (num_of_device_found - 1));
          resolve("commissioning completed");
        }
        else{ /* Default msg: "Hello, world!" */
        }
      });
    }
  });
}

function refreshSliderValue(brightness){
  return new Promise((resolve, reject) => {
    led_brightness_slider.value = brightness;
    resolve("slider has been refreshed");
  });
}

async function refreshFadingInfo(){
  return new Promise((resolve, reject) => {
    loading_screen.style.display = "block";
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      return characteristic.writeValueWithoutResponse(
        asciiToUint8Array(control_gear_short_address.toString() + BLE_CMD_QUERY_FADE_TIME_AND_RATE + (0).toString())
      )
      .then(async (promise) => {
        await delay_ms(300);
        getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
          .then((characteristic) =>{
          return characteristic.readValue()
          .then((dataview) => {
            log(dataview);
            return dataview.getUint8(0);
          })
          .then((res) => {
            log(res);
            log(typeof(res));
            var fade_time_code = (res >> 4);
            var fade_rate_code = (res & 15);
            var children = document.getElementById("fade-time-menu").children;
            var i = 0;
            var found = false;
            while(!found && i < children.length) {
              if(children[i].value === (fade_time_code).toString()){
                fade_time = children[i].innerText;
                found = true;
              }
              i++;
            }
            log("fade time: " + fade_time);
            fade_time = parseFloat(fade_time);
            if(found && fade_time > 0){
              document.getElementById("fading-status").innerHTML = fade_time;
              document.getElementById("led-breathing").style.display = "block";
              // note.style.cssText
              document.getElementById("fade-time-code-" + fade_time_code.toString()).selected += true; 
              in_breathing = true;
            }
            else{
              document.getElementById("fading-status").innerHTML = "Disabled";
              document.getElementById("led-breathing").style.display = "none";
              in_breathing = false;
            }
            
            loading_screen.style.display = "none";
            resolve("promise");
          })
          .catch((error) => {
            log(error);
            loading_screen.style.display = "none";
          });
        });
      });
    });
  });
}

async function ledBreathing(){
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
  .then((characteristic) => {
    return characteristic.writeValueWithoutResponse(
      asciiToUint8Array(control_gear_short_address.toString() + BLE_CMD_DAPC_COMMAND + MAX_BRIGHTNESS.toString())
    );
  })
  .then(async (promise) => {
    await delay_ms(fade_time * 1000);
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array(control_gear_short_address.toString() + BLE_CMD_DAPC_COMMAND + (0).toString())
      );
    })
    await delay_ms(fade_time * 1000);
    if(led_breathing_toggle_state > 0){
      setTimeout(ledBreathing, 200);
      in_breathing = true;
    }
    else{
      in_breathing = false;
    }
  })
}

function isValidFile(){
  return new Promise((resolve, reject) => {
    if(firmware_data === null){
      reject("No file chosen");
    }
    else{
      resolve(firmware_data);
    }
  });
}

function btFileCharacteristicNotifyHandler(event){
  // event.target.value: str_buf
  let dataview = event.target.value;
  var str_buf = new TextDecoder().decode(dataview);
  time(str_buf);
  if(str_buf.toString() == "Y"){
    log("BT notification: action completed");
  }
  else if(str_buf.toString() == "C"){
    time("BT notification: device connected");
  }
  loading_screen.style.display = "none";
  // getCharacteristic(SERVICE_UUID, CHARACTERISTIC_FILE_UUID)
  // .then((characteristic) => {
  //   characteristic.stopNotifications()
  //   .then((promise) => {
  //     log("stop receive notification");
  //   });
  // });
}