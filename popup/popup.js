const container = document.getElementById("container");
let cachedUsers = [];
let cachedActivityTypes = [];

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["sessionId", "bizDomainId"], ({ sessionId, bizDomainId }) => {
    if (!sessionId) {
      return showLogin();
    }

    const headers = {
      "Authorization": sessionId,
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    if (bizDomainId) {
      headers["X-Bizdomain"] = bizDomainId;
    }

    fetch("https://app.didar.me/api/account/Me", { headers })
      .then(res => {
        if (res.status === 401) throw new Error("Unauthorized");
        return res.json();
      })
      .then(() => {
        if (bizDomainId) {
          fetchUserList();
        } else {
          showBizDomainSelection();
        }
      })
      .catch(() => {
        chrome.storage.local.remove(["sessionId", "bizDomainId"], () => {
          showLogin();
        });
      });
  });
});

function showLogin() {
  container.innerHTML = `
    <h1>کارساز!</h1>
    <p class="login-subtitle">تا یادت نرفته فعالیت رو برای خودت یا همکارت ثبت کن!</p>
    <p>نام کاربری و رمز عبور دیدار را وارد کنید.</p>
    <input type="text" id="username" placeholder="نام کاربری (ایمیل)">
    <input type="password" id="password" placeholder="رمز عبور">
    <button id="loginBtn">ورود</button>
  `;
  document.getElementById("loginBtn").addEventListener("click", login);
}

function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  fetch("https://app.didar.me/api/Authentication/Login_V2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ Username: username, Password: password, GOOGLE: null })
  })
    .then(res => res.json())
    .then(data => {
      const sessionId = data?.SessionId;
      const accounts = data?.Response?.Accounts;
      const userId = data?.Response?.Id;

      if (!sessionId || sessionId === "ناموفق") return alert("ورود ناموفق بود.");
      chrome.storage.local.set({ sessionId, cachedAccounts: accounts, currentUserId: userId }, () => {
        showBizDomains(accounts);
      });
    })
    .catch(() => alert("خطا در ارتباط با سرور."));
}

function showBizDomains(accounts) {
  container.innerHTML = `<h1>انتخاب شرکت</h1>`;
  accounts.forEach(account => {
    const { Title: title, Name: name } = account.Bizdomain;
    if (!title || !name) return;

    const card = document.createElement("div");
    card.className = "biz-card";
    card.innerText = title;
    card.onclick = () => {
      chrome.storage.local.set({ bizDomainId: name }, () => {
        fetchUserList();
      });
    };
    container.appendChild(card);
  });
}

function fetchUserList() {
  chrome.storage.local.get(["sessionId", "bizDomainId"], ({ sessionId, bizDomainId }) => {
    fetch("https://app.didar.me/api/user/GetUserList", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bizdomain": bizDomainId,
        "Authorization": sessionId
      },
      body: JSON.stringify({})
    })
      .then(res => res.json())
      .then(data => {
        cachedUsers = (data?.Response || []).filter(u => !u.IsDisabled);
        fetchActivityTypes();
      });
  });
}

function fetchActivityTypes() {
  chrome.storage.local.get(["sessionId", "bizDomainId"], ({ sessionId, bizDomainId }) => {
    fetch("https://app.didar.me/api/activity/GetActivityType", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bizdomain": bizDomainId,
        "Authorization": sessionId
      },
      body: JSON.stringify({})
    })
      .then(res => res.json())
      .then(data => {
        cachedActivityTypes = (data?.Response || []).filter(a => !a.IsDisabled);
        showActivityForm();
      });
  });
}

function showActivityForm() {
  chrome.storage.local.get(["currentUserId"], ({ currentUserId }) => {
    if (!currentUserId) {
      console.warn("currentUserId not found in storage!");
    }

    const userOptions = cachedUsers.map(u => {
      const isSelected = String(u.UserId).trim() === String(currentUserId).trim();
      return `
        <option value="${u.UserId}" ${isSelected ? "selected" : ""}>
          ${u.FirstName} ${u.LastName}
        </option>`;
    }).join("");

    const activityOptions = cachedActivityTypes.map(a =>
      `<option value="${a.Id}" data-duration="${a.Duration}">${a.Title}</option>`).join("");

    container.innerHTML = `
      <h1>ایجاد فعالیت جدید</h1>
      <a id="logoutLink" class="logout-link">خروج</a>
      <input type="text" id="title" placeholder="عنوان فعالیت">
      <select id="activityType">${activityOptions}</select>
      <select id="owner">${userOptions}</select>
      <textarea id="note" placeholder="توضیحات فعالیت"></textarea>
      <button id="saveBtn">ایجاد فعالیت</button>
    `;

    document.getElementById("saveBtn").addEventListener("click", saveActivity);
    document.getElementById("logoutLink").addEventListener("click", () => {
      chrome.storage.local.clear(() => location.reload());
    });
  });
}




function logout() {
  chrome.storage.local.remove(["sessionId", "bizDomainId", "cachedAccounts"], () => {
    showLogin();
  });
}

function saveActivity() {
  chrome.storage.local.get(["sessionId", "bizDomainId"], ({ sessionId, bizDomainId }) => {
    const title = document.getElementById("title").value;
    const activityTypeId = document.getElementById("activityType").value;
    const duration = parseInt(document.querySelector(`#activityType option[value="${activityTypeId}"]`).dataset.duration);
    const ownerId = document.getElementById("owner").value;
    const note = document.getElementById("note").value;

    const now = new Date().toISOString();

    fetch("https://app.didar.me/api/activity/SaveActivity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bizdomain": bizDomainId,
        "Authorization": sessionId
      },
      body: JSON.stringify({
        Activity: {
          ActivityTypeId: activityTypeId,
          Title: title,
          Duration: duration,
          OwnerId: ownerId,
          Note: note,
          DueDate: now,
          DoneDate: now,
          DueDateType: "NoTime",
          DoneDateType: "Notime",
          RecurrenceEndDate: now,
          RecurrenceType: "OneTime",
          RecurrenceData: 1,
          RecurrenceCount: 1,
          Notifies: [],
          Contacts: [],
          _loc: { top: 0, height: 25, width: 100, right: 0 }
        },
        NewAttachments: [],
        SetDone: false
      })
    })
      .then(res => res.json())
      .then(() => {
        alert("فعالیت با موفقیت ایجاد شد!");
        window.close();
      })
      .catch(err => {
        alert("خطا در ایجاد فعالیت");
        console.error(err);
      });
  });
}
