/** 
 * @version 0.13
 * @status debug
 * 
 * @issue
 * - return error when calling gattCharacteristic.startNotification: "GATT server is disconnected."
 * 
 * @todo
 * - [DOING] add routine for close the SPA of data transfer after update firmware via Wi-Fi
 * - [A] fix the issue that client cannot perform some action by the time receiving new characteristic
 * - renew short/group address by using GTIN and ID before renewBusInfoOnBLEServer()
 *  - reset the layout after the firmware update process is completed 
 * 
 * @changelog
 * ver 0.13
 * - [DOING] changed the waiting approach of SPIFFS formatting
 * - object BluetoothRemoteGattServer is not iterable.
 * - this client checks whether the connection is established after function 
 *   bluetoothDeviceGattServer.connect() is fired. The return value of this 
 *   command is not settled until ~3.5s of handshaking.
 * 
 * ver 0.12
 * - changed the firmware update routine.
 * 
 * ver 0.11
 * - added command "BLE_CMD_START_WIFI_ADVERTISMENT": for firmware update process
 * - fixed the issue of race condition when connecting to the ble server (startNotification)
 * 
 * ver 0.10
 * - Add/Remove/Go-To Scenes
 * - modified connect routine: hide loading screen after notifications are set.
 * 
 * ver 0.9
 * - added getAllControlGearID() to update routine
 * 
 * ver 0.8
 * - disable update firmware by short address (cannot distinguish control gears belong to same product series)
 * - added rountine updateFWUGroupAddress(): renew the firmware update's group address after commissioning
 * - addded DEBUG and CMD notification handler
 * - added additional condition for escaping from commission loop
 * 
 * ver 0.7
 * - added ENABLE DEVICE TYPE to the calling rountine
 * 
 * ver 0.6
 * - fixed the issue of file path
 *  - use File System Access API instead of fetch()
 * - changed the handler for file selecting
 * - loading screen overlay added
 * - user can upload the firmware via phone/tablet
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
const BLE_CMD_SET_SCENE_BASE                          = " 305 ";  // 305 - 320
const BLE_CMD_SET_SCENE_MAX                           = " 320 ";
const BLE_CMD_REMOVE_SCENE_BASE                       = " 321 ";  // 321 - 336
const BLE_CMD_REMOVE_SCENE_MAX                        = " 336 ";
const BLE_CMD_GO_TO_SCENE_BASE                        = " 337 ";  // 337 - 352
const BLE_CMD_GO_TO_SCENE_MAX                         = " 352 ";
const BLE_CMD_QUERY_SCENE_BASE                        = " 353 ";  // 353 - 368
const BLE_CMD_QUERY_SCENE_MAX                         = " 368 ";
const BLE_CMD_QUERY_ALL_SCENE_DAPC_VALUE              = " 369 ";
const BLE_CMD_SET_ALL_CONTROL_GEAR_SHORT_ADDRESSES    = " 400 ";
const BLE_CMD_SET_ALL_CONTROL_GEAR_GROUP_ADDRESSES    = " 401 ";
const BLE_CMD_GET_ALL_CONTROL_GEAR_GTIN               = " 402 ";
const BLE_CMD_GET_ALL_CONTROL_GEAR_GROUP_ADDRESSES    = " 403 ";
const BLE_CMD_CONTROL_GEAR_COMMISSIONING              = " 404 ";
const BLE_CMD_SET_ALL_CONTROL_GEAR_DEVICE_TYPE        = " 405 ";
const BLE_CMD_GET_ALL_CONTROL_GEAR_ID                 = " 406 ";
const BLE_CMD_GET_CONTROL_GEAR_GROUP_GTIN             = " 407 ";
const BLE_CMD_GET_ALL_CONTROL_GEAR_SHORT_ADDRESSES    = " 408 ";
const BLE_CMD_GET_ALL_CONTROL_GEAR_DEVICE_TYPE        = " 409 ";
const BLE_CMD_GET_MTU_SIZE                            = " 500 ";
const BLE_CMD_BEGIN_FILE_TRANSFER                     = " 501 ";
const BLE_CMD_END_FILE_TRANSFER                       = " 502 ";
const BLE_CMD_FORMAT_SPIFFS                           = " 600 ";
const BLE_CMD_EXIT_INITIALIZATION                     = " 601 ";
const BLE_CMD_START_WIFI_ADVERTISMENT                 = " 800 ";

const SET_SCENE_BASE = 305;
const REMOVE_SCENE_BASE = 321;
const GOTO_SCENE_BASE = 337;
const QUERY_SCENE_BASE = 353;

const ZERO_ASCII_CODE = 48;
const ESP32_BLE_MTU_SIZE = 512;
const GTIN_WORD_SIZE_IN_BYTES = 13; /* 12 bytes data + 1 byte blank character */
const ID_WORD_SIZE_IN_BYTES = 17; /* 16 bytes data + 1 byte blank character */
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

const ERROR_FADING_DISABLED = -1;
const ERROR_FADING_SET_TO_DISABLED = -2;
const ERROR_FADE_TIME_MISSING = -3;
const GOT_FADE_TIME = 1;

const NORMAL_DELAY_TIME = 200;

const COMMISSIONING_TIME_LIMIT = (15 * 60 * 1000);

const DEBUG_SHORT_ADDRESS = 0;

const DATA_BLOCK_OVERHEAD_SIZE = 14;

const REPLY_STR_BUF_TYPE = {
  SHORT_ADDRESS: 0,
  SCENE_VALUE: 1,
};
Object.freeze(REPLY_STR_BUF_TYPE);

var bluetoothDevice;
var bluetoothDeviceGattServer;

var buffer;
var deviceConnected = false;
var ble_characteristic_value_buf;
var characteristic_buffer_value = new ArrayBuffer(20);
var control_gear_short_address = 1; // short address for the command sequence
var availiable_control_gear;  // array of short addresses available of control gear
var scene_value; // array of scene value (profile 0 - 15)
var ble_mtu_size = 0;

var file_name;
// 2022-05-17 Bryan
// need array of GTIN and group addresses 
var control_gear_group_address;
var control_gear_gtin;

// 2022-06-01 Bryan
var original_selected_gtin;

// 2022-05-30 Bryan
var control_gear_id;
var control_gear_device_type;

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

// 2022-05-27 Bryan
var request_fade_time_fail_counter = 0;
var fading_disabled = false;

// 2022-06-02 Bryan
var commissionFinished = false;

var null_option = document.createElement("option");
null_option.id = "";
null_option.value = "";
null_option.textContent = "";

var ble_wifi_button_pressed = 0;

var firmware_update_file_object;
var file_date_of_release;
var date_of_release;

// var device_found = false;
var connectedDevicesList = new Array();

var formatCompleted = false;
// 2022-06-21
// struct of each control gear
const CONTROL_GEAR_INFO = function(short_address, group_address, gtin, id){
  this.short_address = short_address;
  this.group_address = group_address;
  this.gtin = gtin;
  this.id = id;
}

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

let dapc_mode_select_menu = document.getElementById("dapc-mode-selection-menu");
let goto_scene_menu = document.getElementById("scene-menu");
let set_dapc_scene_number = document.getElementById("set-dapc-scene-number");
let set_dapc_scene_value = document.getElementById("set-dapc-scene-value");
let set_dapc_scene_button =  document.getElementById("set-dapc-scene-button");
let remove_dapc_scene_number = document.getElementById("remove-dapc-scene-number");
let remove_dapc_scene_button = document.getElementById("remove-dapc-scene-button"); 

let recall_control_gear = document.getElementById("recall-control-gear");

// DEBUG
let readCharacteristic = document.getElementById("read-ble-characteristic");
let writeCharacteristic = document.getElementById("write-ble-characteristic");
let read_gtin_button = document.getElementById("read-gtin-button");
let set_group_address_button = document.getElementById("set-group-address-button");
let ble_cmd_end_file_transfer_button = document.getElementById("ble-cmd-end-file-transfer-button");
let control_gear_commissioning_button = document.getElementById("control-gear-commissioning-button");
let get_all_control_gear_device_types_button = document.getElementById("get-all-control-gear-device-types-button");
let http_post_send_data = document.getElementById("http-post-send-data");
let ble_wifi_button = document.getElementById("stop-BLE-start-wifi-button")


connectButton.addEventListener("click", async function () {
  var classList = document.getElementById("device-connection-text-box").classList;

  loading_screen.style.display = "block";
  connect()
  .then(async (promise) => {
    classList.remove("w3-light-grey", "w3-red");
    classList.add("w3-light-green"); 
    
    await delay_ms(NORMAL_DELAY_TIME);

    // GATT operation in progress
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_FILE_UUID)
    .then(async (characteristic) => {
      characteristic.startNotifications()
      .then((characteristic) => {
        time("wait FILE notification");
      })
      .catch((error) => {
        time(error);
      });
      // does the android phone know the notification bit(s) are set?
      characteristic.addEventListener("characteristicvaluechanged", btFileCharacteristicNotifyHandler);
      return "promise";
    })
    .then(async(promise) => {
      await delay_ms(100);
      getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
      .then((characteristic) => {
        characteristic.startNotifications()
        .then((characteristic) => {
          time("wait CMD notification");
          loading_screen.style.display = "none";
        });
        characteristic.addEventListener("characteristicvaluechanged", btCmdCharacteristicNotifyHandler);
      })
      .catch((error) => {
        time(error);
        loading_screen.style.display = "none";
      });
      return "promise";
    })
    .then(async(promise) => {
      await delay_ms(NORMAL_DELAY_TIME);
      getCharacteristic(SERVICE_UUID, CHARACTERISTIC_DEBUG_UUID)
      .then((characteristic) => {
        characteristic.startNotifications()
        .then((characteristic) => {
          time("wait DEBUG notification");
        });

        characteristic.addEventListener("characteristicvaluechanged", btDebugCharacteristicNotifyHandler);
      })
      .catch((error) => {
        time(error);
      });
    });
  })
  .catch((error) => {
    loading_screen.style.display = "none";
    classList.remove("w3-light-grey", "w3-light-green");
    classList.add("w3-red");
  });
  
});

disconnectButton.addEventListener("click", async function () {
  disconnect()
  .then((promise) => {
    var classList = document.getElementById("device-connection-text-box").classList;
    log("caught error: connect()");
    classList.remove("w3-light-green", "w3-light-red");
    classList.add("w3-light-grey");
  });
});

refreshStatus.addEventListener("click", async function () {
  in_breathing = false;
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
    }
  );
  
  await delay_ms(NORMAL_DELAY_TIME /* 100 */);
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
    }
  );

  await delay_ms(NORMAL_DELAY_TIME /* 100 */);
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

  await delay_ms(NORMAL_DELAY_TIME /* 100 */);

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

  await delay_ms(NORMAL_DELAY_TIME /* 100 */);

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

  /** @check reduce waiting time if possible */
  await delay_ms(NORMAL_DELAY_TIME /* original: 100 ms */);

  refreshControlDashboard()
  .then((brightness) => {
  });
});

read_control_gear.addEventListener("click", async function () {
  loading_screen.style.display = "block";
  controlGearCommisioning()
  .then(async (promise) => {
    return isCommissionFinished();
  })
  .then(async (promise) => {
    log("Commissioning completed");
    /** 
     * @checklist guanantee to get the short address of control gears
    */
    getControlGearPresent()
    .then((num_of_availiable_control_gear) => {
      return num_of_availiable_control_gear;
    })
    .then(async (num_of_availiable_control_gear) => {
      return setAllControlGearGroupAddress()
              .then((promise) => {
                return promise;
              });
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
    .then(async(promise) => {
      await delay_ms(1000);
      return getAllControlGearID()
        .then((promise) =>{
          return promise; // resolve("got ID");
        });
    })
    /** skip fetching device type: not implement the message in controller */
    // .then(async (promise) =>{
    //   await delay_ms(1000);
    //   return getAllControlGearDeviceType()
    //     .then((promise) =>{
    //       return promise;
    //     });
    // })
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
      document.getElementById("firmware-update-group-address-selection-container").style.display = "block";
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
  // isValidFile()
  // .then(async (data) => {
    // // format SPIFFS
    formatSPIFFS() 
    .then(async (promise) => {
      isFormatCompleted()
      .then(async(promise) => {
        log("format completed");
        return reconnect()
        .then(async (resolve) => {
          // get MTU size from the MCU
          return getMTUsize()
          .then(async (promise) => {
            getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
                  .then((characteristic) => {
                    characteristic.writeValueWithoutResponse(
                      asciiToUint8Array(firmware_update_address.toString() + BLE_CMD_BEGIN_FILE_TRANSFER + (0).toString())
                    )
                  });
  
            alert("Please connect to the Wi-Fi Access Point DALI_GATEWAY\
              \nUse IP \"192.168.4.1\" to upload file.");
            loading_screen.style.display = "block";
            /**
             * @NOTE potential issue of the update process the re-generated short address
             *        routine should be get back the new value from the controller
            */
            // Set all bus info
            // return renewBusInfoOnBLEServer()
            // .then(async (promise) => {
            //   /* Get all bus info */
            //   getAllControlGearGTIN()
            //   .then(async (promise) => {
            //     await delay_ms(NORMAL_DELAY_TIME);
            //     // return getAllControlGearID()
            //     // .then(async (promise) => {
            //       // await delay_ms
            //     return getAllControlGearGroupAddress();
            //     // })
            //   })
            //   .then(async (promise) => {
            //     log("change FW update address");
            //    return updateFWUGroupAddress()
            //     .then(async (promise) =>{
            //       /** Divide the data into chunks based on MTU size 
            //        * expected test result (test.hex): 
            //        * => 12393 Bytes / (MTU size)
            //        * => 25 data chunks to transfer the test file
            //        */ 
            //       getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
            //       .then((characteristic) => {
            //         characteristic.writeValueWithoutResponse(
            //           asciiToUint8Array(firmware_update_address.toString() + BLE_CMD_BEGIN_FILE_TRANSFER + (0).toString())
            //         )
            //       });
  
            //       alert("Please connect to the Wi-Fi Access Point DALI_GATEWAY\
            //       Use IP \"192.168.4.1\" to upload file.");
            //       loading_screen.style.display = "block";
            //     })
            //   });
            // });
          });
        })
        .catch((error) => {
          alert("error caught: reconnect");
        });
      })
    })

    // check the initialization value from CMD characteristic
    // wait for 15s. Device takes around 14.5s to initalize 
    // await delay_ms(15000);

    // return getMTUsize()
    //   .then(async (promise) => {
    //     getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    //     .then((characteristic) => {
    //       characteristic.writeValueWithoutResponse(
    //         asciiToUint8Array((240).toString() + BLE_CMD_BEGIN_FILE_TRANSFER + (0).toString())
    //       )
    //       .then((promise) => {
    //         loading_screen.style.display = "none";
    //       })
    //     });
    //   });
    
  // });

  /* clear loading screen when BT notification received */
  /* also update all options in menus */
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

  /** 
   * @todo save the GTIN
  */
  original_selected_gtin = control_gear_gtin[dropdown.value];

  // show update button
  document.getElementById("firmware-update-button")
  .style.display = "block";
})

control_gear_select_menu.addEventListener("change", async function() {
  // reset state of led breathing
  in_breathing = false;

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
          // also refresh the device info of the selected control gear

          document.getElementById("control-gear-gtin").innerHTML  = "0x" + control_gear_gtin[control_gear_short_address].toString(16).toUpperCase();
          document.getElementById("control-gear-group-address").innerHTML = control_gear_group_address[control_gear_short_address];
          // @issue: some device cannot fetch ID
          document.getElementById("control-gear-id").innerHTML = "0x" + control_gear_id[control_gear_short_address].toString(16).toUpperCase();
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

fade_time_menu.addEventListener("change", async function() {
  in_breathing = false;
  var dropdown = document.getElementById("fade-time-menu");
  if(!fading_disabled){
    var fade_time_code = dropdown.value;
    log(fade_time_code);
    log(typeof(fade_time_code));
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then(async (characteristic) => {
      return characteristic.writeValueWithoutResponse(
        asciiToUint8Array(control_gear_short_address.toString() + BLE_CMD_SET_FADE_TIME + fade_time_code)
      );
    })
    .then(async (promise) => {
      /** 
       * @TODO check the computing time for the command sequence to optimze the timing
       */
      await delay_ms(300);
      refreshFadingInfo();
    })
  }
  else{
    dropdown.disabled = true;
  }
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
    in_breathing = true;
    ledBreathing();
  }
  else{
    log("off");
    in_breathing = false;
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
        // document.getElementById("firmware-update-type-container").style.display = "block";
        document.getElementById("firmware-update-group-address-selection-container").style.display = "block";
      })
    })
  })
  .catch((error) => {
    document.getElementById("firmware-update-file-name").innerText = "No file chosen";
    firmware_data = null;
  });
})

get_all_control_gear_device_types_button.addEventListener("click", function(){
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
  .then((characteristic) => {
    characteristic.writeValueWithoutResponse(
      asciiToUint8Array((0).toString() + BLE_CMD_SET_ALL_CONTROL_GEAR_DEVICE_TYPE + (0).toString())
    )
  })/* Get the reply */;
})

http_post_send_data.addEventListener("click", async function(){
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
  const url = "http://192.168.4.1";

  isValidFile()
  .then((data) => {
    var headers_obj = new Headers([
      ["Content-Type", "text/plain"],
      ["Content-Length", data.byteLength.toString()]
    ]);
  
    const init_obj = {
      method: "POST",
      headers: headers_obj,
      body: data,
      mode: "no-cors"
    };
  
    fetch(url, init_obj)
    .then((response) => {
      alert(response);
    });
  })
  .catch((error) => {
    alert(error);
  });
})

let deviceCache = null;

async function connect() {
  return new Promise((resolve, reject) => {
    // Connect to the bluetooth device
    requestBluetoothDevice()
    .then((gattServer) => {
      // copy the original value from gattServer object reference
      log("Device: " + gattServer.connected);
      if (gattServer.connected) {
        document.getElementById("control-panel-container").style.display = "block";
        document.getElementById("read-control-gear-container").style.display = "block";

        /** show the short address(es) menu once connected to the same device 
         * lookup table should be exist if multiple devices are connected
        */

        /** allow users to skip scanning DALI network if this client have connected once */
        if(ble_wifi_button_pressed > 0){
          document.getElementById("recall-control-gear").style.display = "block";
        }
        else{
          document.getElementById("recall-control-gear").style.display = "none";
        }

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
  return new Promise((resolve, reject) => {
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
    resolve("disconnected");
  });
}

// 2022-05-13 Bryan
async function reconnect() {
  return new Promise((resolve, reject) => {
    exponentialBackoff(3, 2,
      async function toTry(){
        return new Promise(async(resolve, reject) => {
          time("Try to reconnect with BLE device");
          await bluetoothDeviceGattServer.connect();
          await delay_ms(3500);
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
    filters: [{ namePrefix: "ESP32"/*"dali_test"*/ }],
    optionalServices: [SERVICE_UUID],
  };
  return new Promise(async (resolve, reject) => {
      log("Requesting bluetooth device...");
      navigator.bluetooth.requestDevice(options)
      .then((bluetoothDeviceObject) => {
        bluetoothDevice = bluetoothDeviceObject;
        /* check the device connected in this session */
        var index = 0;
        // use when the user requires to connect multiple devices
        // device_found = false;
        // while(connectedDevicesList.legth > 0 && !found){
        //   if(connectedDevicesList.at(index) == bluetoothDevice.id){
        //     device_found = true;
        //   }
        // }
        // if(!device_found){
        //   connectedDevicesList.append(bluetoothDevice.id);
        // }
        return bluetoothDevice;
      })
      .then(async (device) =>{
        log(device);
        gatt_connect(device)
        .then(async (gattServer) => {
          bluetoothDeviceGattServer = gattServer;
          // wait 3.5s and then evaluate the connection status
          await delay_ms(3500);
          log(bluetoothDeviceGattServer);
          var promise = gattServer;
          resolve(promise);
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
      // the value is evaluated without expanding the object reference.
      // .connected contains the default value
      // JSON.stringify(...)
      log(JSON.stringify(gattServer));
      deviceConnected = device.gatt.connected;
      if (deviceConnected == true) {
        // characteristic_presentation_format
        // alert("characteristic format: " + device.gatt.characteristic_presentation_format);
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
          time(promise);
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
    
    // evaluate the connect property in gattServer before getPrimaryService(). try reconnect() routine
    if(!bluetoothDeviceGattServer.connected){
      reconnect()
      .then((promise) => {
        log("(re)connected");

        return bluetoothDeviceGattServer.getPrimaryService(service_uuid)
        .then((service) => {
          resolve(service);
        })
        .catch((error) =>{
          // log("GATT Server is disconnected.");
          alert(error);
          document.getElementById("device-connection-display-status").innerHTML = "Disconnected";
          document.getElementById("control-panel-container").style.display = "none";

          var classList = document.getElementById("device-connection-text-box").classList;
          classList.remove("w3-light-grey", "w3-light-green");
          classList.add("w3-red");
          
          reject(error);
        });
      })
      // if still cannot connect to the device, alert the user to restart the BLE server
      .catch((error) => {
        reject("Cannot connect to BLE device");
      });
    }
    else{
      return bluetoothDeviceGattServer.getPrimaryService(service_uuid)
      .then((service) => {
        resolve(service);
      })
      .catch((error) =>{
        // log("GATT Server is disconnected.");
        alert(error);
        document.getElementById("device-connection-display-status").innerHTML = "Disconnected";
        document.getElementById("control-panel-container").style.display = "none";

        var classList = document.getElementById("device-connection-text-box").classList;
        classList.remove("w3-light-grey", "w3-light-green");
        classList.add("w3-red");
        
        reject(error);
      });
    }
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

/**
 * @brief refresh the DAPC level of the selected control gear
 */
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
        if(dataview.byteLength > 0){
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
        }
        else{
          loading_screen.style.display = "none";
          reject("Cannot fetch data");
        }
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
     * clear all options in firmware update short address
     */
    document
    .getElementById("firmware-update-short-address-selection-menu")
    .replaceChildren();

    /**
     * clear all options in firwmare udpate group address (with GTIN)
     */
    document
      .getElementById("firmware-update-group-address-selection-menu")
      .replaceChildren();

    // send command to ESP32 DALI gateway
    log("Ask ESP32 to scan through network, find all short address(es)");
    await delay_ms(100);
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      return characteristic.writeValueWithoutResponse(
        // asciiToUint8Array("0 400 0")
        asciiToUint8Array((0).toString() + BLE_CMD_SET_ALL_CONTROL_GEAR_SHORT_ADDRESSES + (0).toString())
      );
    });

    // scan through the network require ~3.047s on MCU
    // changed the waiting time
    await delay_ms(3200);

    /* get the devices' short addresses */
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      return characteristic.writeValueWithoutResponse(
        // asciiToUint8Array("0 400 0")
        asciiToUint8Array((0).toString() + BLE_CMD_GET_ALL_CONTROL_GEAR_SHORT_ADDRESSES + (0).toString())
      );
    });

    await delay_ms(3200);

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
      /**  @todo: modify this function defintion: general purpose should be convert variable-sized string to array of values */
      parseWordsSeparatedBySpace(str_buf, REPLY_STR_BUF_TYPE.SHORT_ADDRESS)
      .then((availiable_control_gear) => {
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
  return new Promise((resolve, reject) => {
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      characteristic.writeValueWithoutResponse(
        /* only command word is meaningful, address word and value word are discarded */
        asciiToUint8Array((0).toString() + BLE_CMD_FORMAT_SPIFFS + (0).toString())
      )
      .then((promise) => {
        resolve(promise);
      })
    });
    /* "N" should be received after formatting */
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
    .then(async (characteristic) => {
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
        return new TextDecoder().decode(dataview);
      })
      .then((str_buf) => {
        var i = 0;
        log("str buf length: " + str_buf.length);
        // If the data transferred is not a whole word, discard that word 
        var num_of_word = Math.floor(str_buf.length / GTIN_WORD_SIZE_IN_BYTES);
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
    .then(async (characteristic) => {
      time("Send BLE Cmd: " + BLE_CMD_GET_ALL_CONTROL_GEAR_GROUP_ADDRESSES);
      return characteristic.writeValueWithoutResponse(
        asciiToUint8Array((0).toString() + BLE_CMD_GET_ALL_CONTROL_GEAR_GROUP_ADDRESSES + (0).toString())
      );
      // write completed
    })
    .then(async(promise) => {
      // wait for 1 sec for device ready
      await delay_ms(1000);
      // get reply
      time("Get reply");
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

async function renewBusInfoOnBLEServer() {
  return new Promise(async(resolve, reject) => {
    // let the BLE server get the required bus info first
    // All data on the server side have been erased after formmating SPIFFS
    await getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      /** BLE_CMD_SET_ALL_CONTROL_GEAR_SHORT_ADDRESSES: update the short addresses, GTIN
       * (and ID)
      */
      return characteristic.writeValueWithoutResponse(
        // asciiToUint8Array("0 400 0")
        asciiToUint8Array((0).toString() + BLE_CMD_SET_ALL_CONTROL_GEAR_SHORT_ADDRESSES + (0).toString())
      );
    })
    .then(async(promise) => {
      // scan through the network require ~3.047s on MCU
      // update the dropdown menu
      await delay_ms(3200);
      log("Controller recovers short address(es)");
      getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
      .then((characteristic) => {
        characteristic.readValue()
        .then((dataview) => {
          return new TextDecoder().decode(dataview);
        })
        .then(async (str_buf) => {
          return parseWordsSeparatedBySpace(str_buf, REPLY_STR_BUF_TYPE.SHORT_ADDRESS)
            .then((availiable_control_gear) => {
              time("get all short addresses");
              return availiable_control_gear;
            });
        });
      });
    });

    await delay_ms(3200);

    await setAllControlGearGroupAddress()
        .then(async (promise) => {
          log("Controller recovers group address(es)");
          await delay_ms(NORMAL_DELAY_TIME);
          getAllControlGearGroupAddress();
        });
    


    await delay_ms(NORMAL_DELAY_TIME);

    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array((0).toString() + BLE_CMD_SET_ALL_CONTROL_GEAR_DEVICE_TYPE + (0).toString())
      )
    });
    // scan through the network require ~3.047s on MCU
    await delay_ms(3200);

    log("Controller recovers device type(s)");

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
    return success(result);
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
  firmware_update_file_object = fileList[0];
  file_name = fileList[0].name;
  if(file_name !== "undefined"){ // File is selected
    // show options for user to update (indivdual device / same product)
    log("foo: handle file");
    fileList[0].arrayBuffer()
    .then((array_buf) => {
      firmware_data = array_buf;
      log(firmware_data);
    })
    // document.getElementById("firmware-update-type-container").style.display = "block";
    document.getElementById("firmware-update-group-address-selection-container").style.display = "block";
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
    commissionFinished = false;
    var num_of_entry = 0;
    var entryTime = Date.now();
    // cheange the logic to esacpe by notification
    
    // while(!commissionFinished) {
    //   await delay_ms(5000);
    //   num_of_entry++;
    //   getCharacteristic(SERVICE_UUID, CHARACTERISTIC_DEBUG_UUID)
    //   .then((characteristic) => {
    //       return characteristic.readValue();
    //   })
    //   .then((dataview) => {
    //     log(dataview);
    //     return new TextDecoder().decode(dataview);
    //   })
    //   .then(async (str_buf) => {
    //     var num_of_device_found = parseInt(str_buf);
    //     log(str_buf);
    //     log(num_of_device_found);
    //     // alert("Number of device(s) found: " + num_of_device_found);
    //     if(num_of_device_found == 0){
    //       reject("no device");
    //       commissionFinished = true;
    //     }
    //     else if(num_of_device_found >= 1 && num_of_device_found <= 64){
    //       commissionFinished = true;
    //       await delay_ms(5000 * (num_of_device_found - 1));
    //       resolve("commissioning completed");
    //     }
    //     else{ /* Default msg: "Hello, world!" */
    //     }
    //   });
    // }
    var elaspedTime = Date.now();
    var timeout_event_id = setTimeout(daliBusPowerReminder, 30 * 1000);
    while(!commissionFinished 
      && ((elaspedTime - entryTime) <= COMMISSIONING_TIME_LIMIT/* maximum allow time limit for commissioning (in ms) */)
    ){
      elaspedTime = Date.now();
      await delay_ms(1000);
      log("commission finished: " + commissionFinished);
    }
    clearTimeout(timeout_event_id);
    // alert("escape from while loop");
    resolve("commissioning completed");
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
    var reply;
    var dropdown = document.getElementById("fade-time-menu");
    loading_screen.style.display = "block";
    if(fading_disabled){
      // show blank in the selected state
      dropdown.children[0].selected = true;
      for(var i = 1; i < dropdown.children.length; i++){
        dropdown.children[i].selected = false;
      }
      // disable the selection
      dropdown.disabled = true;

      getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
      .then((characteristic) => {
        characteristic.writeValueWithoutResponse(
          asciiToUint8Array(control_gear_short_address.toString() + BLE_CMD_SET_FADE_TIME + (0).toString())
        );
      });
      
      reply = ERROR_FADING_DISABLED;
      // reset loading screen
      loading_screen.style.display = "none";
      reject(reply);
    }
    else {
      if(request_fade_time_fail_counter >= 3){
        fading_disabled = true;
        reply = ERROR_FADING_SET_TO_DISABLED;
        loading_screen.style.display = "none";
        reject(reply);
      }
      else{
        getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
        .then((characteristic) => {
          return characteristic.writeValueWithoutResponse(
            asciiToUint8Array(control_gear_short_address.toString() + BLE_CMD_QUERY_FADE_TIME_AND_RATE + (0).toString())
          )
          .then(async (promise) => {
            await delay_ms(300);
            await getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
              .then((characteristic) =>{
              return characteristic.readValue()
              .then((dataview) => {
                log(dataview);
                // 2022-05-27 Bryan 
                /**
                 * if characteristic cannot get from the control gear,
                 * increment request_fade_time_fail_counter.
                 * 
                 * Case: (request_fade_time_fail_counter >= 3),
                 *  Disable the breathing button and menu for the device on-time
                 */
                if(dataview.byteLength == 0){ // reply cannot be got from the control gear
                  request_fade_time_fail_counter++;
                  return -1;  // return -1 to indicate error occur: reply is corrupted during transmission                
                }
                else{
                  return dataview.getUint8(0);
                }
              })
              .then(async (res) => {
                var found = false;
                log(res);
                log(typeof(res));
                if(res == -1){
                  await delay_ms(NORMAL_DELAY_TIME);
                  
                  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
                  .then((characteristic) => {
                    characteristic.writeValueWithoutResponse(
                      asciiToUint8Array(control_gear_short_address.toString() + BLE_CMD_SET_FADE_TIME + (0).toString())
                    );
                  });

                  fade_time = 0;

                  reply = ERROR_FADE_TIME_MISSING;
                }
                else {
                  var fade_time_code = (res >> 4);
                  var fade_rate_code = (res & 15);
                  var children = document.getElementById("fade-time-menu").children;
                  var i = 0;
                  while(!found && i < children.length) {
                    if(children[i].value === (fade_time_code).toString()){
                      children[i].selected = false;
                      fade_time = children[i].innerText;
                      found = true;
                    }
                    i++;
                  }

                  log("fade time: " + fade_time);
                  // fade_time_code = 0: innerText => "undefined"
                  if(fade_time == "undefined"){
                    fade_time = 0;
                  }
                  else{
                    fade_time = parseFloat(fade_time);
                  }

                  reply = GOT_FADE_TIME;
                }

                if(found && fade_time > 0){
                  document.getElementById("fading-status").innerHTML = fade_time;
                  document.getElementById("led-breathing").style.display = "block";
                  // reset the selected option
                  children[0].selected = false;
                  // set to corresponding option on the bus to be shown on the menu
                  document.getElementById("fade-time-code-" + fade_time_code.toString()).selected = true; 
                  in_breathing = true;
                }
                else{
                  document.getElementById("fading-status").innerHTML = "Disabled";
                  document.getElementById("led-breathing").style.display = "none";
                  in_breathing = false;
                }

                // reset loading screen
                loading_screen.style.display = "none";
                if(reply > 0){
                  resolve(reply);
                }
                else{
                  reject(reply);
                }
              })
              .catch((error) => {
                // reset loading screen
                loading_screen.style.display = "none";
                log(error);
                reject(error);
              });
            });
          });
        });
      }
    }
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
    if(in_breathing){
      setTimeout(ledBreathing, 200);
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

async function btFileCharacteristicNotifyHandler(event){
  // event.target.value: str_buf
  let dataview = event.target.value;
  var str_buf = new TextDecoder().decode(dataview);
  time(str_buf);
  if(str_buf.toString() == "B"){
    alert("BT notification: File transferred. But, control gear not ready");
  }
  if(str_buf.toString() == "Y"){
    alert("BT notification: Firmware update transfer completed");
  }
  else if(str_buf.toString() == "G"){
    alert("BT notification: NO control gear exist");
  }
  else if(str_buf.toString() == "F"){
    alert("BT notification: Firmware update failed");
  }
  else if(str_buf.toString() == "S"){
    /* "S" indicates the data is stored in SPIFFS*/
    alert("BT notification: data is saved in SPIFFS");
    sendBleCmd(firmware_update_address, BLE_CMD_END_FILE_TRANSFER, 0)
    .then((promise) =>{
      log("Controller starts IEC62386-105 procedure");
    });
    // loading_screen.style.display = "none";
  }
  else if(str_buf.toString() == "N"){
    /* "N" -> the filesystem is formatted */
    // reset the flag
    formatCompleted = true;
    log("SPIFFS partition is formatted");
  }

  if(str_buf.toString() == "B"
    || str_buf.toString() == "Y"
    || str_buf.toString() == "G"
    || str_buf.toString() == "F"
    ){
    alert("Address changed. Please scan the devices again.");
    // reset the state instead of update the info. 
    // The selected target may be different from the original one
    // await updateBusInfoOnScreen();
    document.getElementById("selected-control-gear-container").style.display = "none";
    document.getElementById("device-control-dashboard-container").style.display = "none";
    loading_screen.style.display = "none";
  }

  // getCharacteristic(SERVICE_UUID, CHARACTERISTIC_FILE_UUID)
  // .then((characteristic) => {
  //   characteristic.stopNotifications()
  //   .then((promise) => {
  //     log("stop receive notification");
  //   });
  // });
}

async function btCmdCharacteristicNotifyHandler(event){
  // event.target.value: str_buf
  let dataview = event.target.value;
  var str_buf = new TextDecoder().decode(dataview);
  if(str_buf.toString() == "R"){
    commissionFinished = true;
    // log("notification received");
    alert("notification value " + str_buf.toString());
  }
}

async function btDebugCharacteristicNotifyHandler(event){
  // event.target.value: str_buf
  let dataview = event.target.value;
  var str_buf = new TextDecoder().decode(dataview);
  if(str_buf.toString() == "R"){
    commissionFinished = true;
    // log("notification received");
    log("notification value" + str_buf.toString());
  }
  else{
    alert(str_buf);
  }
}

async function updateBusInfoOnScreen(){
  /**
   * @TODO complete the part og refresh GTIN, ID and slider
  */
  return new Promise((resolve, reject) => {
    /** refresh all dropdown menu containing bus info 
     *  control-gear-select-menu
     *  firmware-update-short-address-selection-menu
     *  firmware-update-group-address-selection-menu
    */

    /* control-gear-select-menu */
    updateControlGearSelectMenu(availiable_control_gear)
    .then((promise) => {
      refreshControlDashboard()
      .then(async (brightness) => {
        await delay_ms(200);
        refreshFadingInfo()
        .then((promise) => {
          updateFirmwareUpdateShortAddressMenu().then((promise) => {
            updateFirmwareUpdateGroupAddressMenu().then((promise) => {
              return promise;
            })
          });
        });
      });  
    });
    /** refresh GTIN and ID showing 
     * selected-control-gear-info-container
    */
    document.getElementById("control-gear-gtin").innerHTML  = "0x" + control_gear_gtin[control_gear_short_address].toString(16).toUpperCase();
    /* @NOTE: ID cannot be fetched */
    /** refresh DAPC value and fade time setting 
     * led-status
     * led-brightness
     * fading-status
    */
    document.getElementById("control-gear-id").innerHTML = "0x" + control_gear_id[control_gear_short_address].toString(16).toUpperCase();

    /** refresh slider value 
     * led-brightness-slider
    */

    resolve("Info updated");
  });
}

async function getAllControlGearID(){
  /**
   * @TODO send cmd, then get all control gear ID
  */
  return new Promise(async (resolve, reject) => {
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
      .then(async (characteristic) => {
        return characteristic.writeValueWithoutResponse(
          asciiToUint8Array((0).toString() + BLE_CMD_GET_ALL_CONTROL_GEAR_ID + (0).toString())
        );
      })
      .then(async (promise) => {
        /**
         * device ID should be stored in ble server already
         * get all data from controller
         */
        await delay_ms(1000);

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
          var i = 0;
          log("str buf length: " + str_buf.length);
          // If the data transferred is not a whole word, discard that word 
          var num_of_word = Math.floor(str_buf.length / ID_WORD_SIZE_IN_BYTES); // (8 Bytes * 2) + 1
          log("Number of ID: " + num_of_word);
  
          // reset the array
          control_gear_id = new Array();
  
          while(i < (num_of_word * ID_WORD_SIZE_IN_BYTES)){
            control_gear_id.push((parseInt(str_buf.slice(i, (i + ID_WORD_SIZE_IN_BYTES - 1)), 16)));
            i = i + ID_WORD_SIZE_IN_BYTES;
          }
          resolve("Get ID");
        });
      })
  });
}

async function parseWordsSeparatedBySpace(str_buf, str_type /** short address, scene value */){
  return new Promise(async (resolve, reject) => {
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

    if(str_type == REPLY_STR_BUF_TYPE.SCENE_VALUE){
      scene_value = new Array();
      for (var i = 0; i < sliced_word_buf.length; i++) {
        scene_value.push(parseInt(sliced_word_buf[i]));
      }
      log(scene_value);
      resolve(scene_value);
    }
    else if(str_type == REPLY_STR_BUF_TYPE.SHORT_ADDRESS){
      /* available_control_gear is the array of short addresses */
      availiable_control_gear = new Array();
      var num_of_availiable_control_gear = 0;
      for (var i = 0; i < sliced_word_buf.length; i++) {
        availiable_control_gear.push(parseInt(sliced_word_buf[i]));
        num_of_availiable_control_gear++;
      }
      /* parse END */
      log("num of control gear found: " + num_of_availiable_control_gear);
      resolve(availiable_control_gear);
    }
  });
}

function updateFWUGroupAddress(){
  /**
   * BLE server has to send the FW update to new group address (group address after
   * formatting SPIFFS)
   * 
   * Prerequsires:
   * - New bus info is stored to this ble client
   * 
   * Procedure:
   * lookup the new group address for FW update by using GTIN 
   */
  return new Promise((resolve, reject) => {
    var i = 0;
    var matchedGroupFound = false; 
    while(i < control_gear_gtin.length && !matchedGroupFound) {
      if(control_gear_gtin[i] == original_selected_gtin){
        // arbritary control gear with the matched gtin is found
        firmware_update_group_address = control_gear_group_address[i];
        firmware_update_address = firmware_update_group_address + CONTROL_GEAR_WRAPPED_GROUP_0_ADDRESS;
        matchedGroupFound = true;
      }
      i++;
    }
    log("New firmware update group address: " + firmware_update_group_address);
    resolve("FW update group address updated");
  });
}

async function updateControlGearSelectMenu(){
  return new Promise((resolve, reject) => {
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
    resolve("control gear menu updated");
  });
}

function daliBusPowerReminder(){
  alert("Plese check the power supply for the DALI bus");
  setTimeout(daliBusPowerReminder, 30 * 1000);
}

async function getAllControlGearDeviceType(){
  return new Promise(async(resolve, reject) =>{
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
      .then((characteristic) => {
        characteristic.writeValueWithoutResponse(
          asciiToUint8Array((0).toString() + BLE_CMD_SET_ALL_CONTROL_GEAR_DEVICE_TYPE + (0).toString())
        )
      });
    // scan through the network require ~3.047s on MCU
    await delay_ms(3200);

    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
      .then((characteristic) =>{
        characteristic.readValue()
          .then((dataview) => {
            log("dataview");
            log(dataview);
            return new TextDecoder().decode(dataview);
          })
          .then((str_buf) => {
            /**
             * [NOT yet implemented in the DALI controller]
             * - receive message e.g. "0: 1 6; 1: 6;"
             * separator within same control gear: ' '
             * separator for different control gear: ';'
             */ 
          });
      });
  })
}

dapc_mode_select_menu.addEventListener("change", async function(){
  var dropdown = document.getElementById("dapc-mode-selection-menu");
  if(dropdown.value == "n"){
    document.getElementById("scene-menu-container").style.display = "none";
    document.getElementById("set-dapc-scene-form-container").style.display = "none";
    document.getElementById("remove-dapc-scene-form-container").style.display = "none";
  }
  else if(dropdown.value == "s"){
    document.getElementById("remove-dapc-scene-form-container").style.display = "none";
    document.getElementById("scene-menu-container").style.display = "none";
    document.getElementById("set-dapc-scene-form-container").style.display = "block";
  }
  else if(dropdown.value == "r"){
    document.getElementById("scene-menu-container").style.display = "none";
    document.getElementById("set-dapc-scene-form-container").style.display = "none";
    document.getElementById("remove-dapc-scene-form-container").style.display = "block";
  }
  else if(dropdown.value == "g"){
    document.getElementById("set-dapc-scene-form-container").style.display = "none";
    document.getElementById("remove-dapc-scene-form-container").style.display = "none";
    document.getElementById("scene-menu-container").style.display = "block";
    // refresh the GOTO scene menu
    loading_screen.style.display = "block";
    refreshDAPCSceneMenu()
    .then((promise) => {
      loading_screen.style.display = "none";
    });
  }
});

goto_scene_menu.addEventListener("change", async function(){
  // value of option = DAPC value
  // id (post-fix) = sceneNumber
  var dropdown = document.getElementById("scene-menu");
  var index = parseInt(dropdown.value);
  log("DAPC value: " + scene_value[index]);
  log("const GOTO_SCENE_BASE: " + typeof(GOTO_SCENE_BASE));
  log("index type: " + typeof(index));
  var command_word = " " + (GOTO_SCENE_BASE + index).toString() + " ";
  log(command_word);
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
  .then((characteristic) => {
    characteristic.writeValueWithoutResponse(
      asciiToUint8Array(/*(0).toString()*/ control_gear_short_address.toString() + command_word + (0).toString())
    );
  });
  // update the slider & DAPC info
  await delay_ms(NORMAL_DELAY_TIME);
  refreshControlDashboard();
});

set_dapc_scene_button.addEventListener("click", async function(){
  if(set_dapc_scene_number.value != "undefined" && set_dapc_scene_value.value != "undefined"){
    // log("scene no. " + set_dapc_scene_number.value + " " + typeof(set_dapc_scene_number.value));
    // log("scene value: " + set_dapc_scene_value.value + " " + typeof(set_dapc_scene_value.value));
    var scene_number = parseInt(set_dapc_scene_number.value) + SET_SCENE_BASE;
    var scene_number_str_buf = " " + scene_number.toString() + " ";
    log(scene_number_str_buf);
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array(/*(0).toString()*/ control_gear_short_address.toString() + scene_number_str_buf.toString() + set_dapc_scene_value.value.toString())
      );
    });
    await delay_ms(NORMAL_DELAY_TIME);
  }
  else{
    alert("missing parameter");
  }
});

remove_dapc_scene_button.addEventListener("click", function(){
  if(remove_dapc_scene_number != "undefined"){
    log("REMOVE scene no. " + remove_dapc_scene_number.value);
    var scene_number = parseInt(remove_dapc_scene_number.value) + REMOVE_SCENE_BASE;
    var scene_number_str_buf = " " + scene_number.toString() + " ";
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array(/*(0).toString()*/control_gear_short_address.toString() + scene_number_str_buf + (0).toString())
      );
    })
  }
  else{
    alert("missing parameter");
  }
});

async function refreshDAPCSceneMenu(){
  return new Promise(async (resolve, reject) => {
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array(/*(0).toString()*/ control_gear_short_address.toString() + BLE_CMD_QUERY_ALL_SCENE_DAPC_VALUE + (0).toString())
      );
    });
    
    await delay_ms(800);  // scan 64 elements requires ~3.2s; 16 elements: 3.2 * 0.25 = 0.8s
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then(async (characteristic) => {
      characteristic.readValue()
      .then((dataview) => {
        log(dataview);
        return new TextDecoder().decode(dataview);
      })
      .then(async (str_buf) => {
        // 16 values
        log("str_buf: " + str_buf);
        parseWordsSeparatedBySpace(str_buf, REPLY_STR_BUF_TYPE.SCENE_VALUE)
        .then((scene_profile) => {
          return scene_profile;
        })
        .then((scene_profile) => {
          /** show loading screen */
          /**
           * clear all options in scene menu
           */
          document
          .getElementById("scene-menu")
          .replaceChildren(null_option);
          
          var drop_down_menu_option;
          for (var i = 0; i < 16; i++) {
            if(scene_value[i] >= 0 && scene_value[i] < 0xFF){
              drop_down_menu_option = document.createElement("option");
              drop_down_menu_option.id = "option-" + i;
              drop_down_menu_option.textContent = "Scene " + (i).toString() + ": " + scene_value[i].toString();
              drop_down_menu_option.value = i;
              document
                .getElementById("scene-menu")
                .appendChild(drop_down_menu_option);
            }
          }
          resolve("menu updated");
          /** hide loading screen */
        });
      });
    });
  });
}

ble_wifi_button.addEventListener("click", function(){
  ble_wifi_button_pressed++;
  /** send command to ESP32: BLE_CMD_START_WIFI_ADVERTISMENT
   * It is a no-reply command: the BLE server is not supppose to exist anymore
   */
  getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
  .then((characteristic) => {
    characteristic.writeValueWithoutResponse(
      asciiToUint8Array((0).toString() + BLE_CMD_START_WIFI_ADVERTISMENT + (0).toString())
    )
    .then((promise) => {
      disconnect()
      .then((promise) => {
        var classList = document.getElementById("device-connection-text-box").classList;
        log("caught error: disconnect()");
        classList.remove("w3-light-green", "w3-light-red");
        classList.add("w3-light-grey");
      });
    })
  });
});

recall_control_gear.addEventListener("click", function(){
  // show the container
  document.getElementById("control-panel-container").style.display = "block";
  document.getElementById("selected-control-gear-container").style.display = "block";
});

function fileDescriptionGenerator(){
  var date_buf = new Date(firmware_update_file_object.lastModified);
  log(date_buf);
  date_of_release = date_buf.getFullYear().toString() + "-";
  // return of getMonth() is zero-based
  date_of_release += (date_buf.getMonth()+ 1).toString() + "-";
  date_of_release += date_buf.getDate().toString();
  log(date_of_release);
  // other parameters may require user input
}

function dataBlockWrapper(chunks){
  var i = 0;
  while (i < chunks.length){
    var data_buf = new Uint8Array(chunks[i].byteLength + DATA_BLOCK_OVERHEAD_SIZE);
    /* Under construction */
    i++;
  }
}

function sendBleCmd(address, command, value){
  return new Promise((resolve, reject) => {
    getCharacteristic(SERVICE_UUID, CHARACTERISTIC_CMD_UUID)
    .then((characteristic) => {
      characteristic.writeValueWithoutResponse(
        asciiToUint8Array(address.toString() + command + value.toString())
      )
      .then((promise) => {
        resolve(promise);
      });
    });
  });
}

async function isFormatCompleted(){
  return new Promise(async (resolve, reject) => {
    formatCompleted = false;
    while(!formatCompleted){
      await delay_ms(1000);
    }
    resolve("format completed");
  });
}