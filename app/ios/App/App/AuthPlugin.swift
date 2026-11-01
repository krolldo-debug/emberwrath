import UIKit
import Capacitor
import AuthenticationServices
import Security

// Anmeldung in der App (ab 1.1): „Weiter mit Apple“ in Apples eigenem Fenster, Google im Anmeldefenster des Systems
// (ASWebAuthenticationSession; Google lässt keine Anmeldung in eingebetteten Ansichten zu) und die Sitzung zusätzlich im
// Schlüsselbund, damit man angemeldet bleibt, auch wenn iOS den Speicher der Spielansicht leert.
// Das Spiel ruft die Methoden über Capacitor.nativePromise('EmberAuth', …) auf (src/app/auth.js).
@objc(EmberAuthPlugin)
public class EmberAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "EmberAuthPlugin"
    public let jsName = "EmberAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "apple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "web", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "vaultGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "vaultSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "vaultClear", returnType: CAPPluginReturnPromise),
    ]

    private var appleCall: CAPPluginCall?
    private var webSession: ASWebAuthenticationSession?

    private func anchor() -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor() }
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { anchor() }

    // ------------------------------------------------------------ Apple
    // { nonce } (SHA-256 als Hex) → { idToken, name }. Den Namen nennt Apple nur bei der ersten Anmeldung.
    @objc func apple(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce") else {
            call.reject("nonce fehlt", "bad_request")
            return
        }
        DispatchQueue.main.async {
            self.appleCall?.reject("abgebrochen", "cancel")
            self.appleCall = call
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = nonce
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = appleCall else { return }
        appleCall = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = credential.identityToken, let token = String(data: data, encoding: .utf8) else {
            call.reject("Kein Token von Apple", "failed")
            return
        }
        let name = [credential.fullName?.givenName, credential.fullName?.familyName].compactMap { $0 }.joined(separator: " ")
        call.resolve(["idToken": token, "name": name])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = appleCall else { return }
        appleCall = nil
        let canceled = (error as? ASAuthorizationError)?.code == .canceled
        call.reject(error.localizedDescription, canceled ? "cancel" : "failed")
    }

    // ------------------------------------------------------------ Anmeldefenster des Systems (Google)
    // { url, scheme } → { url } der Rückleitung (scheme://…?code=…). Geteilte Cookies mit Safari: wer dort bei Google
    // angemeldet ist, wählt nur noch sein Konto.
    @objc func web(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https",
              let scheme = call.getString("scheme") else {
            call.reject("Adresse fehlt", "bad_request")
            return
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] back, error in
                self?.webSession = nil
                if let back = back {
                    call.resolve(["url": back.absoluteString])
                    return
                }
                let canceled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
                call.reject(error?.localizedDescription ?? "Anmeldung fehlgeschlagen", canceled ? "cancel" : "failed")
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.webSession = session
            if !session.start() {
                self.webSession = nil
                call.reject("Anmeldefenster ließ sich nicht öffnen", "failed")
            }
        }
    }

    // ------------------------------------------------------------ Schlüsselbund
    private static var base: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.emberwrath.game.session",
            kSecAttrAccount as String: "supabase",
        ]
    }

    // → { value? } (JSON der Sitzung)
    @objc func vaultGet(_ call: CAPPluginCall) {
        var query = Self.base
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        if SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data,
           let value = String(data: data, encoding: .utf8) {
            call.resolve(["value": value])
        } else {
            call.resolve([:])
        }
    }

    // { value }: nach dem ersten Entsperren lesbar (auch wenn iOS die App im Hintergrund startet), nur auf diesem Gerät
    @objc func vaultSet(_ call: CAPPluginCall) {
        guard let data = call.getString("value")?.data(using: .utf8) else {
            call.reject("value fehlt", "bad_request")
            return
        }
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(Self.base as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(Self.base.merging(attributes) { a, _ in a } as CFDictionary, nil)
        }
        if status == errSecSuccess { call.resolve() } else { call.reject("Schlüsselbund: \(status)", "keychain") }
    }

    @objc func vaultClear(_ call: CAPPluginCall) {
        SecItemDelete(Self.base as CFDictionary)
        call.resolve()
    }
}
