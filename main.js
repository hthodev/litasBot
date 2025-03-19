import fs from "fs/promises";
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from "node-fetch";
import readline from 'readline/promises';
import { TurnstileTask } from 'node-capmonster';
import { Solver } from "@2captcha/captcha-solver";
import bestcaptchasolver from 'bestcaptchasolver';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const sitekey = "0x4AAAAAAA5ufO6a8DkJVX0v";
console.log("1. 2Captcha - 2. Capmonster - 3. CapResolve (khuyến khích vì nó rẻ nhất) - 4. Bestcaptchasolver");
const type = await rl.question("Nhập loại service giải captcha: ");
const apiKey = await rl.question("Nhập api key của bạn: ");

async function solverCaptcha(pageurl, type) {
  if (type === "1") {
    console.log("Đang giải captcha bằng 2Captcha");
    const solver = new Solver(apiKey);
    const result = (await solver.cloudflareTurnstile({ pageurl, sitekey })).data;
    console.log("Đã giải xong captcha");
    return result;
  }
  if (type === "2") {
    console.log("Đang giải captcha bằng Capmonster");
    const capMonster = new TurnstileTask(apiKey);
    const task = capMonster.task({
        websiteKey: sitekey,
        websiteURL: pageurl
    });
    const taskId = await capMonster.createWithTask(task)
    const result = await capMonster.joinTaskResult(taskId)
    console.log("Đã giải xong captcha");
    return result.token
  }
  if (type === "3") {
    const Solver = (await import("capsolver-npm")).Solver;
    const solver = new Solver({
      apiKey,
    });
    try {
      const token = await solver.turnstileproxyless({
        websiteURL: pageurl,
        websiteKey: sitekey,
      });
      console.log("Đã giải xong captcha");
      return token.token
    } catch (error) {
      console.log("CapResolve Error: ", error.message);
    }
  }
  if (type === "4") {
    bestcaptchasolver.set_access_token(apiKey);
    try {
      const id = await bestcaptchasolver.submit_turnstile({
        page_url: pageurl,
        site_key: sitekey,
      })
      const token = await bestcaptchasolver.retrieve_captcha(id);
      console.log("Đã giải xong captcha");
      return token.solution
    } catch (error) {
      console.log("Bestcaptchasolver Error: ", error.message);
    }
  }
}


const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  Accept: "application/json",
};

async function getInfo(token, agent) {
  const headerInfo = {
    ...headers,
    authorization: `Bearer ${token.trim()}`,
    referer: "https://wallet.litas.io/miner",
  };
  const options = {
    method: "GET",
    headers: headerInfo,
    agent,
  };

  const response = await fetch(
    "https://wallet.litas.io/api/v1/users/current-user",
    options
  );
  const user = await response.json().catch(() => ({}));

  const response2 = await fetch(
    "https://wallet.litas.io/api/v1/users/current-user/balances",
    options
  );
  const balance = await response2.json().catch(() => ({}));

  return { user, balance };
}

async function login(body, agent, xtoken, cookie) {
  const headerInfo = {
    ...headers,
    "Accept-Encoding": "gzip, deflate, br",
    "X-CSRF-TOKEN": xtoken,
    Referer: "https://wallet.litas.io/login",
    "Accept-Encoding": "gzip, deflate, br",
    "Content-Type": "application/json",
    Cookie: cookie,
  };

  const options = {
    method: "POST",
    headers: headerInfo,
    agent,
    body: JSON.stringify({
      emailOrUserName: body.username,
      password: body.password,
      rememberMe: true,
      reCaptchaResponse: await solverCaptcha("https://wallet.litas.io/login", type),
    }),
  };

  const response = await fetch(
    "https://wallet.litas.io/api/v1/auth/login",
    options
  );
  const rs = await response.json().catch(() => ({}));
  
  if (rs.accessToken) {
    return { accessToken: rs.accessToken }
  }
  return { accessToken: null }
}

async function getXToken(token = '', agent) {
  const headerInfo = {
    ...headers,
    Referer: "https://wallet.litas.io/miner",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
  };
  if (!token) {
    headerInfo.Authorization = "";
    headerInfo.Referer = "https://wallet.litas.io/login";
  } else {
    headerInfo.Authorization = `Bearer ${token.trim()}`
  }

  const options = {
    method: "GET",
    headers: headerInfo,
    agent,
    credentials: "include",
  };
  const response = await fetch(
    "https://wallet.litas.io/api/v1/antiforgery/token",
    options
  );
  const cookies = response.headers.get("Set-Cookie");
  const data = await response.json().catch(() => ({}));

  return { xtoken: data.token, cookie: cookies.split("; ")[0] };
}

async function minerClaim(token, xtoken, agent, refCode, cookie) {
  const headerInfo = {
    ...headers,
    authorization: `Bearer ${token.trim()}`,
    "Accept-Encoding": "gzip, deflate, br",
    "X-CSRF-TOKEN": xtoken,
    "IDEMPOTENCY-KEY": refCode,
    Referer: "https://wallet.litas.io/miner",
    Cookie: cookie,
  };
  const options = {
    method: "PATCH",
    headers: headerInfo,
    agent,
  };
  const response = await fetch(
    "https://wallet.litas.io/api/v1/miner/claim",
    options
  );
  const rs = await response.json().catch(() => ({}));
  if (response.status === 204) {
    return "✅ claim thành công";
  }
  return `❌ ${rs?.errors?.[0]?.message}` || "❌ Lỗi gì đó nữa ad không biết";
}

async function readFiles() {
  const proxyStr = await fs.readFile("proxies.txt", "utf-8");
  const proxies = proxyStr.trim().split("\n");
  const accountStr = await fs.readFile("accounts.txt", "utf-8");
  const accounts = accountStr.trim().split("\n");
  return { proxies, accounts };
}

async function update(token, xtoken, agent, cookie, refCode) {
  const headerInfo = {
    ...headers,
    authorization: `Bearer ${token.trim()}`,
    "Accept-Encoding": "gzip, deflate, br",
    "X-CSRF-TOKEN": xtoken,
    "IDEMPOTENCY-KEY": refCode,
    Referer: "https://wallet.litas.io/miner",
    Cookie: cookie,
    Accept: "application/json"
  };
  console.log(headerInfo);
  
  const options = {
    method: "PATCH",
    headers: headerInfo,
    agent,
  };
  const response = await fetch(
    "https://wallet.litas.io/api/v1/miner/upgrade/speed",
    options
  );  
  const rs = await response.json().catch(() => ({}));
  if (response.status === 204) {
    return "✅ update thành công";
  }
  return `❌ ${rs?.errors?.[0]?.message}` || "❌ Lỗi gì đó nữa ad không biết";
}

async function main() {
  while (true) {
    const { proxies, accounts } = await readFiles();
    console.log("TOOL ĐƯỢC PHÁT TRIỂN BỞI: THIEN THO TRAN");
    console.log(
      "Tham gia group facebook để nhận tool mới: https://www.facebook.com/groups/2072702003172443/"
    );
    console.log("------------------------------------------------------------");

    for (let i = 0; i < accounts.length; i++) {
      console.log("Đang thực hiện với account", i + 1);
      const proxy = proxies[i].trim();
      const agent = new HttpsProxyAgent(proxy);

      console.log("ℹ️ Đang lấy token là:");
      const xtokenLogin = await getXToken('', agent);
      const body = {
        username: accounts[i].split(",")[0].trim(),
        password: accounts[i].split(",")[1].trim(),
      };
      const { accessToken } = await login(body, agent, xtokenLogin.xtoken, xtokenLogin.cookie);
      if (!accessToken) {
        console.log("Lỗi không đăng nhập được");
        continue;
      }
      const { user, balance } = await getInfo(accessToken, agent);
      console.log("ℹ️ username là:", user.nickName);
      console.log("ℹ️ balance:", balance);

      const { xtoken, cookie } = await getXToken(accessToken, agent, user.nickName);

      const claim = await minerClaim(
        accessToken,
        xtoken,
        agent,
        user.nickName,
        cookie
      );
      console.log(claim);
      if (claim == '❌ Not enough balance to perform this action.') {
        const xupdate = await getXToken(accessToken, agent, user.nickName);
        await update(accessToken, xupdate.xtoken, agent, xupdate.cookie, user.nickName);
        const claimAgain = await minerClaim(
          accessToken,
          xtoken,
          agent,
          user.nickName,
          cookie
        );
        console.log(claimAgain);
      }
      console.log("♾️  Đã hoàn thành xong account ", i + 1);
      console.log("-------------------------------------------------");
    }
    console.log("♾️  Chờ 3 tiếng để tiếp tục");
    await new Promise((resolve) => setTimeout(resolve, (3 * 60 * 60 * 1000) + 20 * 1000));
  }
}

main();
