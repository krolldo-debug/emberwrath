import UIKit
import Capacitor
import UserNotifications

// Mitteilungen (ab App 1.1). Das Spiel fragt erst nach, wenn es passt (src/app/notify.js), nie beim ersten Start.
// Erinnerungen an die Tagesbelohnung plant das Gerät selbst (lokale Mitteilung, kein Server nötig). Für spätere
// Mitteilungen vom Server meldet sich die App nach der Erlaubnis bei Apple an (APNs) und gibt das Geräte-Token heraus.
// Das Spiel ruft die Methoden über Capacitor.nativePromise('EmberPush', …) auf.
//   status()                       → { status: 'granted' | 'denied' | 'prompt' }
//   request()                      Apples Erlaubnis-Abfrage (erscheint nur einmal je Installation) → { status }
//   token()                        → { token? } APNs-Token als Hex (nach Erlaubnis), sonst leer
//   schedule({ id, title, body, at })  lokale Mitteilung zum Zeitpunkt at (ms seit 1970); gleiche id ersetzt die alte
//   cancel({ id })
@objc(EmberPushPlugin)
public class EmberPushPlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "EmberPushPlugin"
    public let jsName = "EmberPush"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "token", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "schedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    ]

    // Apple liefert das Token an den AppDelegate; der reicht es hierher weiter. Alles auf dem Hauptthread.
    private static weak var shared: EmberPushPlugin?
    private var deviceToken: String?
    private var waiting: [CAPPluginCall] = []

    override public func load() {
        Self.shared = self
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        // Schon erlaubt: neu anmelden, das Token kann sich ändern (z. B. nach Wiederherstellung auf neuem Gerät)
        center.getNotificationSettings { settings in
            if Self.allowed(settings.authorizationStatus) {
                DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
            }
        }
    }

    private static func allowed(_ status: UNAuthorizationStatus) -> Bool {
        status == .authorized || status == .provisional || status == .ephemeral
    }

    private static func name(_ status: UNAuthorizationStatus) -> String {
        if allowed(status) { return "granted" }
        return status == .denied ? "denied" : "prompt"
    }

    @objc func status(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve(["status": Self.name(settings.authorizationStatus)])
        }
    }

    @objc func request(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            if granted { DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() } }
            center.getNotificationSettings { settings in
                call.resolve(["status": Self.name(settings.authorizationStatus)])
            }
        }
    }

    // Wartet höchstens 10 Sekunden auf Apple (ohne Netz oder ohne Erlaubnis kommt kein Token).
    @objc func token(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let token = self.deviceToken {
                call.resolve(["token": token])
                return
            }
            self.waiting.append(call)
            DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
                guard let i = self.waiting.firstIndex(where: { $0 === call }) else { return }
                self.waiting.remove(at: i)
                call.resolve([:])
            }
        }
    }

    static func didRegister(_ data: Data) {
        let token = data.map { String(format: "%02x", $0) }.joined()
        DispatchQueue.main.async {
            guard let plugin = shared else { return }
            plugin.deviceToken = token
            plugin.waiting.forEach { $0.resolve(["token": token]) }
            plugin.waiting.removeAll()
        }
    }

    static func didFail() {
        DispatchQueue.main.async {
            guard let plugin = shared else { return }
            plugin.waiting.forEach { $0.resolve([:]) }
            plugin.waiting.removeAll()
        }
    }

    @objc func schedule(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let title = call.getString("title"), let body = call.getString("body"),
              let at = call.getDouble("at") else {
            call.reject("id, title, body, at fehlen", "bad_request")
            return
        }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let seconds = max(1, at / 1000 - Date().timeIntervalSince1970)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: trigger)) { error in
            if let error = error { call.reject(error.localizedDescription, "schedule") } else { call.resolve() }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("id fehlt", "bad_request")
            return
        }
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [id])
        center.removeDeliveredNotifications(withIdentifiers: [id])
        call.resolve()
    }

    // Während man spielt, keine Banner über dem Spiel
    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                       withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([])
    }
}
