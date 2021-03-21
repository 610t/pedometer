const Obniz = require("obniz");
const m5 = new Obniz.M5StickC("OBNIZ_ID_HERE");

//// Don't show console.log()
//console.log = function() {}

console.log("connecting");

m5.onconnect = async() => {
    await m5.setupIMUWait("SH200Q");
    let calibrationVal = 0;

    let initAccelVals;
    for (let i = 0; i < 5; i++) {
        initAccelVals = await m5.accelerationWait();
    }
    calibrationVal = initAccelVals.z - 1.0;
    console.log("calibrationVal: " + calibrationVal);

    let step = 0;
    let total = 0;
    let count = 0;
    let avg = 1.1;
    let width = avg / 10;
    let state = false;
    let old_state = false;

    m5.onloop = async function() {
        let currentAccelVals = await m5.accelerationWait();
        //console.log(currentAccelVals);

        let x_accel = currentAccelVals.x - calibrationVal;
        let y_accel = currentAccelVals.y - calibrationVal;
        let z_accel = currentAccelVals.z - calibrationVal;
        let accel = Math.sqrt(
            x_accel * x_accel + y_accel * y_accel + z_accel * z_accel
        );

        if (count < 100) {
            total += accel;
            count += 1;
        } else {
            avg = total / count;
            width = avg / 10;
            total = avg;
            count = 1;
        }
        if (accel > avg + width) {
            state = true;
        } else if (accel < avg - width) {
            state = false;
        }
        if (!old_state && state) {
            step += 1;
            // m5.display.clear();
            // m5.display.print(String(step));
            m5.led.on();
        } else {
            m5.led.off();
        }
        old_state = state;

        console.log("Step:" + String(step));
        console.log("Count:" + String(count));
        console.log("Accel:" + String(accel));
        console.log("Avg:" + String(avg));

        if (await m5.buttonA.isPressedWait()) {
            m5.display.clear();
            m5.display.print("Step");
            m5.display.print(step);
            m5.display.print(count);
            m5.display.print(accel);
            m5.display.print(avg);
        }
    }
}