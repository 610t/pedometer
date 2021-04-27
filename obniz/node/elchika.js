//// ピン割当
//  0(SDA),1(SCL)       I2C (BMP280+SHT31)
//  2-6                 LED
//  7                   RGB LED shield (WS2812B-3535)
//  8                   USB Fan
//  9                   PIR
//  10,11               servo

const Obniz = require("obniz");
let obniz1 = new Obniz("OBNIZ_1Y_ID");
let m5;

////// 変数の初期化
//// 歩数計関連
let fever = false;
let step = 0; // 歩数
let total = 0; // 加速度合計
let count = 1; // 加速度平均用カウント
let avg = 1.25; // 平均加速度
let width = avg / 10; // 歩数カウント用閾値
let state = false; // 現在の状態
let old_state = false; // 一つ前の状態

//// LED関連
// LEDアレイ
let led = [];
const NUM_OF_LEDS = 6;
// WS2128B RGB LEDアレイ
let leds;
const WS2128_LEDS = 7;

//// サーボ関連
// 歩数差分表示用
let old_step = 0;
let old_time = Date.now();

// サーボモータ表示用の定数
const low_digit = 100; // サーボモーター表示用の下桁
const high_digit = 10; // サーボモーター表示用の上桁

// PIRとFANでの涼風用の定数
let fan_off = true; // ファンの動作状態
let pir_start; // PIRの反応スタート時間
const fan_interval = 3000; // ファン動作継続時間

//// console.log()の出力を抑制する
console.log = function() {}

console.log(">>>>Obniz1 connecting");

obniz1.onconnect = async() => {
    console.info(">>>>Obniz1 on connect");
    console.info(">>Obniz1 connect Date:" + Date().toString());

    m5 = new Obniz.M5StickC("M5STICKC_ID");

    ////// 1Y接続デバイスの初期化
    //// サーボモーター
    let dstep_servo = obniz1.wired("ServoMotor", { signal: 11 });
    let step_servo = obniz1.wired("ServoMotor", { signal: 10 });

    //// BMP280+SHT31用のI2C初期化
    //        obniz.getFreeI2C();は使えない
    // I2Cを使ってBMP280とSHT31を利用する
    let i2c = obniz1.i2c0;
    i2c.start({ mode: "master", sda: 0, scl: 1, clock: 400000 });
    let bmp280 = obniz1.wired("BMP280", { sdi: 0, sck: 1, i2c: i2c });
    let sht31 = obniz1.wired("SHT31", { sda: 0, scl: 1, i2c: i2c });
    await bmp280.applyCalibration(); // BMP280の補正

    // LEDの初期化
    for (let l = 0; l < NUM_OF_LEDS; l++) {
        led[l] = obniz1.wired("LED", { anode: (l + 2) });
    }

    // LED WS2812Bの初期化
    leds = obniz1.wired("WS2812B", { din: 7 });
    await leds.rgbs([
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
    ]);
    await obniz1.wait(1000);
    let colors = [];
    for (let l = 0; l < WS2128_LEDS; l++) {
        let color = [Math.floor(Math.random() * 255), Math.floor(Math.random() * 255), Math.floor(Math.random() * 255)];
        await colors.push(color);
    }
    console.info(colors);
    await leds.rgbs(colors);

    //// M5StickCが接続された時
    m5.onconnect = async() => {
        console.info(">>>> M5 connected");
        console.info(">> M5 Start Date:" + Date().toString());

        m5.i2c1.start({ sda: 21, scl: 22, clock: 100000, pull: "3v", mode: "master", }); // 内蔵I2C(i2c1)の明示的な初期化
        await m5.setupIMUWait("SH200Q"); // IMUの初期化
    }

    //// M5StickC用ループ:歩数計部分
    m5.onloop = async() => {
        try {
            // 加速度を取得する
            let currentAccelVals = await m5.accelerationWait();
            console.log(currentAccelVals);
            let x_accel = currentAccelVals.x;
            let y_accel = currentAccelVals.y;
            let z_accel = currentAccelVals.z;
            let accel = Math.sqrt(x_accel * x_accel + y_accel * y_accel + z_accel * z_accel); // 合成加速度

            // 100回ごとに加速度の平均値を求め、閾値を決める
            if (count < 100) {
                total += accel;
                count += 1;
            } else {
                avg = total / count;
                width = avg / 10;
                total = avg;
                count = 1;
            }

            // 閾値を超えた場合に歩数を加算する
            if (accel > avg + width) {
                state = true;
            } else if (accel < avg - width) {
                state = false;
            }
            if (!old_state && state) {
                step += 1; // 歩数を加算
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
                m5.display.print("Step:" + step);
                m5.display.print("Count:" + count);
                m5.display.print("Accel:" + accel);
                m5.display.print("Avg:" + avg);
            }
            // デバッグ用
            if (await m5.buttonB.isPressedWait()) {
                m5.close();
            }
        } catch (err) {
            console.info(">>>>M5 on loop");
            console.info(">>M5 Loop Date:" + Date().toString());
            console.error(">>M5 Error Name is " + err);

            await m5.wait(10000);
            m5.connect();
            console.info(">>M5 reconnect ");
            console.info(">>Status: obniz1=" + obniz1.connectionState);
            console.info(">>Status: m5=" + m5.connectionState);
        }
    }

    //// M5StickCが切断された時…
    m5.onclose = async() => {
        console.info(">>>>M5 On close");
        console.info(">>M5 Close Date:" + Date().toString());
        console.info(">>M5 Close Step:" + step);

        m5.connect(); // M5の再接続
    }

    //// obniz 1Y用ループ
    obniz1.onloop = async() => {
        //// 現在の情報の表示
        obniz1.display.clear(); // 画面のクリア

        //// 歩数の表示
        obniz1.display.print("Step:" + step + "\n");
        // サーボモーターでの歩数の表示
        // 歩数差分を表示する
        let now = Date.now();
        let dstep = 1000 * (step - old_step) / (now - old_time); // step/sec
        if (dstep > 5) dstep = 5;
        console.log("Delta step:" + dstep);
        let angle = 180 - 180 * (dstep * 0.25);
        if (angle <= 0) { angle = 0; }
        console.log("Angle:" + angle);
        dstep_servo.angle(angle);
        old_time = now;
        old_step = step;
        // LEDでの歩数差分表示
        for (let l = 0; l < Math.floor(dstep); l++) {
            led[l].on();
        }
        for (let l = Math.floor(dstep); l < NUM_OF_LEDS; l++) {
            led[l].off();
        }

        // 歩数をサーボで表示
        angle = 180 - 180 * (step / low_digit) / high_digit;
        if (angle <= 0) { angle = 0; }
        step_servo.angle(angle);
        // 特定歩数を超えた場合のフィーバーモード
        if (fever == false && step >= high_digit * low_digit) {
            const w = 200;
            const lw = 20;
            for (let i = 0; i < 5; i++) {
                dstep_servo.angle(180);
                step_servo.angle(0);
                m5.led.on();
                for (let l = 0; l < NUM_OF_LEDS; l++) {
                    if (l > 0) { led[l - 1].off() }
                    led[l].on();
                    await obniz1.wait(lw);
                }
                led[NUM_OF_LEDS - 1].off();
                await obniz1.wait(w);
                dstep_servo.angle(0);
                step_servo.angle(180);
                m5.led.off();
                for (let l = NUM_OF_LEDS - 1; l >= 0; l--) {
                    if (l < NUM_OF_LEDS - 1) { led[l + 1].off() }
                    led[l].on();
                    await obniz1.wait(lw);
                }
                led[0].off();
                await obniz1.wait(w);
            }
            fever = true;
        }

        // SHT30での気温と湿度の表示
        let v_sht = await sht31.getAllWait();
        console.log(v_sht);
        obniz1.display.print("Temp:" + v_sht.temperature.toFixed(1) + "deg.\n");
        obniz1.display.print("Hum:" + v_sht.humidity.toFixed(1) + "%\n");

        // BMP380での気圧の表示
        let v_bmp = await bmp280.getAllWait();
        obniz1.display.print("Press:" + v_bmp.pressure.toFixed(1) + "hPa");

        console.log("Date:" + Date().toString());

        //// PIRとファンを使った一休み機構 (io9:PIR, io8:FAN)
        if (fan_off && await obniz1.io9.inputWait()) {
            // PIR is ON
            fan_off = false;
            console.info("PIR is ON");
            pir_start = Date.now();
            obniz1.io8.output(true); // FANを起動
        }
        if (!fan_off && Date.now() - pir_start > fan_interval) {
            // Stop FAN
            console.info("Stop FAN");
            fan_off = true;
            obniz1.io8.output(false); // FANを停止
        }

        await obniz1.wait(500);
    }

    //// obniz 1Yが切断された時…
    obniz1.onclose = async() => {
        console.error(">>>>Obniz1 on close");
        console.error(">>Obniz1 Close Date:" + Date().toString());

        m5.close();
        obniz1.connect();
    }
}