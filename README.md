# 🚀 LINE File Collector Hub (Stateless & Cloud-Ready)

ระบบรวบรวมไฟล์จาก LINE Bot และอัปโหลดขึ้น Google Drive อัตโนมัติ พร้อมหน้าจอเว็บแอปสำหรับจัดการแบบพรีเมียม (ดีไซน์และพัฒนาระบบโดย N. Vetchagama)

ระบบนี้ใช้ **Stateless Architecture** สำหรับการรับไฟล์และเก็บข้อมูลบน Google Drive/MySQL โดยไม่ต้องเปิดคอมพิวเตอร์ทิ้งไว้ ทั้งนี้ต้องตั้งค่า secrets และสิทธิ์เข้าถึงให้ถูกต้องก่อนใช้งานจริง

---

## 🛠️ วิธีการติดตั้งออนไลน์ 24 ชั่วโมง (ผ่าน Render.io)

### ขั้นตอนที่ 1: เตรียมโค้ดของคุณขึ้น GitHub
1. สมัครใช้งาน [GitHub](https://github.com/) (หากมีอยู่แล้วสามารถใช้บัญชีเดิมได้เลย)
2. สร้าง Repository สำหรับโค้ดขึ้นมาบน GitHub ตั้งชื่อว่า `line-file-collector` และตรวจสอบว่าไม่มีไฟล์ความลับถูก commit
3. อัปโหลดไฟล์โปรเจกต์นี้ทั้งหมดขึ้น GitHub **ยกเว้น** ไฟล์ความลับเหล่านี้ (ห้ามอัปโหลดเด็ดขาด!) ซึ่งระบบได้ตั้งค่าบล็อกในไฟล์ `.gitignore` ไว้แล้ว:
   - `node_modules/`
   - `.env`
   - `google-token.json`
   - `google-client-secret.json`
   - `google-credentials.json`
   - `downloads/`

---

### ขั้นตอนที่ 2: ติดตั้งและรันบน Render.io (ฟรี 24 ชม.)
1. เข้าเว็บ [Render.io](https://render.com/) และสมัครใช้งาน (เชื่อมต่อกับบัญชี GitHub ของคุณ)
2. ในหน้าแดชบอร์ดหลัก กดปุ่ม **`New +`** สีม่วงขวาบน -> เลือก **`Web Service`**
3. เลือกเชื่อมต่อกับ Repository GitHub ชื่อ `line-file-collector` ที่คุณเพิ่งสร้างขึ้น
4. ตั้งค่าหน้าเว็บรันระบบดังนี้:
   - **Name**: `line-file-collector` (หรือชื่อตามชอบ)
   - **Region**: เลือก `Singapore` (ใกล้ไทยที่สุด โหลดเร็ว)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: เลือกแบบ **`Free`**

5. เลื่อนลงมาด้านล่างสุด คลิกปุ่ม **`Advanced`** เพื่อเปิดหน้าต่างกรอกตัวแปรสภาพแวดล้อม (Environment Variables)

---

### ขั้นตอนที่ 3: กรอกข้อมูลความลับในคลาวด์ (Environment Variables)
กดปุ่ม **`Add Environment Variable`** เพื่อกรอกตัวแปรต่อไปนี้ลงไปบนหน้าเว็บ Render:

| Key (ชื่อตัวแปร) | Value (ค่าที่ต้องนำมาใส่) |
| :--- | :--- |
| `PUBLIC_ORIGIN` | URL จริงของเว็บ เช่น `https://line-file-collector.onrender.com` |
| `DASHBOARD_PIN` | PIN ส่วนตัวสำหรับเข้า Dashboard ห้ามใส่ใน source code |
| `AUTH_SESSION_SECRET` | สุ่มค่าอย่างน้อย 32 ตัวอักษร ใช้เซ็น HttpOnly session cookie |
| `LINE_CHANNEL_ACCESS_TOKEN` | ค่า Token ของ LINE บอทของคุณ |
| `LINE_CHANNEL_SECRET` | ค่า Secret ของ LINE บอทของคุณ |
| `GOOGLE_DRIVE_FOLDER_ID` | ไอดีโฟลเดอร์ Google Drive ของคุณ |
| `ADMIN_PASSWORD` | รหัสผ่านแอดมินแบบยาวและไม่ซ้ำกับบริการอื่น |
| `MAX_FILE_BYTES` | ขนาดไฟล์สูงสุดเป็น byte เช่น `209715200` |
| `GOOGLE_TOKEN_JSON` | **คัดลอกข้อความทั้งหมด** ที่อยู่ภายในไฟล์ `google-token.json` มาวาง |
| `GOOGLE_CLIENT_SECRET_JSON` | **คัดลอกข้อความทั้งหมด** ที่อยู่ภายในไฟล์ `google-client-secret.json` มาวาง |

*(หมายเหตุ: การนำค่าในไฟล์ JSON ไปวางใน Env ของ Render จะช่วยปกป้องความลับของคุณไม่ให้หลุดไปใน Git และทำงานอัปโหลดในคลาวด์ได้ทันที!)*

สำหรับการย้ายระบบเดิม หากยังไม่ได้เพิ่ม `DASHBOARD_PIN` ระบบจะใช้ `ADMIN_PASSWORD` เดิมเป็นค่า fallback ชั่วคราว และถ้ายังไม่มี `AUTH_SESSION_SECRET` ระบบจะสร้างค่าแบบสุ่มใน memory (session จะถูกยกเลิกเมื่อ service restart) ควรเพิ่มสองค่านี้แยกกันบน Render เพื่อความปลอดภัยและความเสถียรของ session

6. คลิกปุ่ม **`Deploy Web Service`** สีม่วงด้านล่างสุด

---

### ขั้นตอนที่ 4: เชื่อมต่อ LINE Webhook เข้ากับลิงก์คลาวด์ใหม่
1. เมื่อระบบบน Render ติดตั้งเสร็จสมบูรณ์ (จะขึ้นคำว่า `Live` สีเขียว) คุณจะได้ลิงก์เว็บสาธารณะฟรี 24 ชั่วโมงจาก Render ด้านบนสุด เช่น:
   `https://your-app-name.onrender.com`
2. คัดลอกลิงก์นั้น แล้วเติมคำว่า **`/webhook`** ต่อท้าย เช่น:
   👉 `https://your-app-name.onrender.com/webhook`
3. นำลิงก์นี้ไปกรอกลงในช่อง **Webhook URL** บนหน้าตั้งค่า **LINE Developers Console** ของบอทตัวเดิมของคุณ กด **Save** และกด **Verify**
4. เรียบร้อย! ระบบของคุณจะออนไลน์แบบ 24 ชั่วโมงสมบูรณ์แบบ คุณสามารถปิดคอมพิวเตอร์ของคุณได้ทันที และบอทจะทำงานรวบรวมไฟล์อัปโหลดเข้า Google Drive พร้อมแสดงบนหน้าเว็บสาธารณะได้ตลอดเวลาครับ! 🚀

## 💻 โหมดทดลองใช้งาน (Demo Mode)

หากคุณต้องการรันเว็บแดชบอร์ดแสดงตัวอย่าง (Demo) เพื่อรีวิวหน้าตาเว็บโดยไม่ต้องเชื่อมต่อกับ LINE หรือ Google Drive จริง โหมดนี้ยังต้องใช้ `DASHBOARD_PIN` และ `AUTH_SESSION_SECRET` เพื่อป้องกันไม่ให้ข้อมูล Demo เปิดสาธารณะ:
- เพียงตั้งค่าตัวแปรสภาพแวดล้อม (Environment Variable) ในระบบคลาวด์:
  `DEMO_MODE=true`
- ระบบจะเปิดโหมด Demo และแสดงข้อมูลไฟล์จำลองขึ้นบนหน้าแดชบอร์ดให้โดยอัตโนมัติทันที!

## 🔐 Security notes

- Dashboard และ Admin ใช้ HttpOnly, SameSite session cookies; ห้ามเก็บรหัสผ่านใน `localStorage` หรือส่งรหัสผ่านซ้ำในคำสั่งลบ
- ครูใช้ `DASHBOARD_PIN` แยกจาก `ADMIN_PASSWORD`; Admin ที่ login แล้วสามารถเปลี่ยน Teacher PIN จากปุ่ม `เปลี่ยน Teacher PIN` ได้
- หากฐานข้อมูล MySQL เชื่อมต่ออยู่ Teacher PIN ที่เปลี่ยนจากหน้า Admin จะถูกบันทึกในตาราง `app_settings` และอยู่รอดหลัง restart
- Local files ไม่ได้เปิดผ่าน `/downloads` แบบสาธารณะ แต่ต้องผ่าน Dashboard session
- ตั้งค่า `PUBLIC_ORIGIN` เป็นโดเมนจริงเพื่อปิด CORS แบบ wildcard
- ตั้งค่า `LINE_CHANNEL_SECRET` เสมอ ระบบจะปฏิเสธ webhook หากตรวจลายเซ็นไม่ได้

---

## 💖 สนับสนุนผู้พัฒนา (Support the Developer)

หากโปรเจกต์นี้มีประโยชน์และช่วยให้งานโรงเรียนของคุณง่ายขึ้น คุณสามารถสนับสนุนและเลี้ยงกาแฟผู้พัฒนา (N. Vetchagama) ได้โดยการสแกน QR Code PromptPay นี้ครับ! ☕

<p align="left">
  <img src="public/images/bmcf.JPG" width="220" alt="PromptPay QR Code">
</p>
