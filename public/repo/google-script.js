/**
 * Google Apps Script - Cloudflare IP Scanner & Relay
 * 
 * این اسکریپت برای پیدا کردن آی‌پی‌های تمیز کلاودفلر و ارسال آن به ورکر طراحی شده است.
 * 
 * راهنمای نصب:
 * 1. به https://script.google.com بروید
 * 2. یک پروژه جدید ایجاد کنید
 * 3. کد زیر را در فایل Code.gs کپی کنید
 * 4. پروژه را Deploy کرده و به عنوان Web App منتشر کنید
 * 5. دسترسی را روی "Anyone" تنظیم کنید
 * 6. URL تولید شده را در ورکر خود استفاده کنید
 * 
 * برای اجرای خودکار:
 * - از منوی Triggers، یک تریگر زمانی (Time-driven) هر 5-10 دقیقه تنظیم کنید
 */

function doGet(e) {
  // ۱. بررسی کش گوگل (اگه تو ۵ دقیقه گذشته تست کرده باشیم، همون رو آنی پس می‌ده)
  var cache = CacheService.getScriptCache();
  var cachedIps = cache.get("best_alive_ips");
  if (cachedIps) {
    return ContentService.createTextOutput(cachedIps).setMimeType(ContentService.MimeType.TEXT);
  }

  // ۲. سورس‌های خام
  var sources = [
    "https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestcf.txt",
    "https://raw.githubusercontent.com/alireza0/s-ui/master/local/bestcf.txt",
    "https://raw.githubusercontent.com/vfarid/cf-ip-scanner/main/ipv4.txt" // یک سورس کمکی اضافه شد
  ];

  var allIps = [];
  var fetchReqs = sources.map(function(url) {
    return { url: url, muteHttpExceptions: true };
  });

  // ۳. دریافت همزمان همه سورس‌ها و استخراج دقیق با Regex
  try {
    var sourceRes = UrlFetchApp.fetchAll(fetchReqs);
    var ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g; // فیلتر دقیق IPv4
    
    for (var i = 0; i < sourceRes.length; i++) {
      if (sourceRes[i].getResponseCode() == 200) {
        var text = sourceRes[i].getContentText();
        var matches = text.match(ipRegex);
        if (matches) {
          allIps = allIps.concat(matches);
        }
      }
    }
  } catch(err) {
    Logger.log("Error fetching sources: " + err.toString());
  }

  // ۴. حذف تکراری‌ها و بُر زدن
  var uniqueIps = [...new Set(allIps)];
  uniqueIps.sort(function() { return 0.5 - Math.random() });
  
  // ۵. انتخاب ۳۰ کاندید برای تست سلامت
  var candidates = uniqueIps.slice(0, 30);
  var testReqs = candidates.map(function(ip) {
    return { url: "http://" + ip, muteHttpExceptions: true };
  });

  var finalOutput = [];
  
  // ۶. شلیک رگباری ریکوئست‌ها برای پیدا کردن آی‌پی‌های زنده
  try {
    var testRes = UrlFetchApp.fetchAll(testReqs);
    for (var j = 0; j < testRes.length; j++) {
      if (testRes[j].getResponseCode() > 0) {
        var cleanIp = testReqs[j].url.replace("http://", "");
        finalOutput.push(cleanIp + ":443#⚡AutoCF_" + (finalOutput.length + 1));
        if (finalOutput.length >= 15) break; // ۱۵ تا سالم پیدا کردیم، کافیه
      }
    }
  } catch(e) {
    Logger.log("Error testing IPs: " + e.toString());
  }

  // ۷. فال‌بک نجات (اگه نت ملی شد یا همه تایم‌اوت شدن)
  if (finalOutput.length === 0) {
    finalOutput.push("proxyip.fofa.info:443#🛡️Fallback");
  }

  // ۸. ذخیره در کش برای ۵ دقیقه (۳۰۰ ثانیه) و ارسال خروجی
  var resultStr = finalOutput.join('\n');
  cache.put("best_alive_ips", resultStr, 300);

  return ContentService.createTextOutput(resultStr).setMimeType(ContentService.MimeType.TEXT);
}

/**
 * تابع کمکی برای ارسال آی‌پی‌های پیدا شده به Cloudflare Worker
 * این تابع را می‌توان به صورت دستی یا از طریق تریگر فراخوانی کرد
 */
function sendToWorker() {
  var workerUrl = PropertiesService.getScriptProperties().getProperty('WORKER_URL');
  
  if (!workerUrl) {
    Logger.log("WORKER_URL not set in Script Properties");
    return;
  }
  
  // دریافت آی‌پی‌های تازه
  var response = doGet();
  var ips = response.getContentText();
  
  // ارسال به ورکر
  var payload = {
    ips: ips,
    timestamp: new Date().toISOString()
  };
  
  try {
    var options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };
    
    var result = UrlFetchApp.fetch(workerUrl + '/update-ips', options);
    Logger.log("Response from worker: " + result.getResponseCode());
  } catch(e) {
    Logger.log("Error sending to worker: " + e.toString());
  }
}

/**
 * تنظیمات اولیه - این تابع را یک بار اجرا کنید تا WORKER_URL ذخیره شود
 */
function setupWorkerUrl() {
  var workerUrl = "https://your-worker.your-subdomain.workers.dev"; // آدرس ورکر خود را اینجا قرار دهید
  PropertiesService.getScriptProperties().setProperty('WORKER_URL', workerUrl);
  Logger.log("Worker URL set to: " + workerUrl);
}
