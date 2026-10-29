import UIKit
import Capacitor
import StoreKit

// Käufe im App Store (StoreKit 2) und die Bewertungsfrage von Apple. Das Spiel ruft die Methoden über
// Capacitor.nativePromise('EmberStore', …) auf (src/app/store.js); die Seite kommt von der Website, ein JS-Paket gibt es nicht.
//
// Ein Kauf wird erst abgeschlossen (finish), wenn der Server ihn geprüft und gutgeschrieben hat (/net/shop/apple).
// Bis dahin liefert unfinished() ihn bei jedem Start erneut, auch nach Absturz, Funkloch oder Erlaubnis der Eltern.
// Jeder Kauf trägt die Konto-ID des Spielers (appAccountToken), damit der Server ihn nur diesem Konto gutschreibt.
@objc(EmberStorePlugin)
public class EmberStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "EmberStorePlugin"
    public let jsName = "EmberStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unfinished", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
    ]

    private var updates: Task<Void, Never>?

    override public func load() {
        // Apple liefert Käufe, die später bestätigt werden, über Transaction.updates. Abgeschlossen werden sie trotzdem erst
        // nach der Prüfung durch den Server; das Spiel holt sie über unfinished() ab.
        updates = Task.detached {
            for await _ in StoreKit.Transaction.updates {}
        }
    }

    deinit { updates?.cancel() }

    private static func entry(_ result: VerificationResult<StoreKit.Transaction>) -> [String: Any]? {
        guard case .verified(let t) = result else { return nil }
        return ["jws": result.jwsRepresentation, "transactionId": String(t.id), "productId": t.productID]
    }

    // { ids: [String] } → { products: [{ id, displayPrice }] }, nur Produkte, die Apple kennt und freigegeben hat
    @objc func products(_ call: CAPPluginCall) {
        let ids = call.options["ids"] as? [String] ?? []
        Task {
            do {
                let list = try await Product.products(for: ids)
                call.resolve(["products": list.map { ["id": $0.id, "displayPrice": $0.displayPrice] }])
            } catch {
                call.reject(error.localizedDescription, "products")
            }
        }
    }

    // { id, account } → { status: 'ok'|'pending'|'cancel', jws?, transactionId? }
    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("id fehlt", "bad_request")
            return
        }
        let account = call.getString("account").flatMap { UUID(uuidString: $0) }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.reject("Produkt nicht gefunden", "not_found")
                    return
                }
                var options: Set<Product.PurchaseOption> = []
                if let account = account { options.insert(.appAccountToken(account)) }
                switch try await product.purchase(options: options) {
                case .success(let result):
                    if let e = Self.entry(result) {
                        call.resolve(e.merging(["status": "ok"]) { a, _ in a })
                    } else {
                        call.reject("Kauf nicht bestätigt", "unverified")
                    }
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancel"])
                @unknown default:
                    call.resolve(["status": "cancel"])
                }
            } catch {
                call.reject(error.localizedDescription, "failed")
            }
        }
    }

    // → { transactions: [{ jws, transactionId, productId }] }: bezahlt, aber noch nicht abgeschlossen
    @objc func unfinished(_ call: CAPPluginCall) {
        Task {
            var out: [[String: Any]] = []
            for await result in StoreKit.Transaction.unfinished {
                if let e = Self.entry(result) { out.append(e) }
            }
            call.resolve(["transactions": out])
        }
    }

    // { transactionId } schließt den Kauf ab (nach der Gutschrift durch den Server)
    @objc func finish(_ call: CAPPluginCall) {
        guard let id = call.getString("transactionId").flatMap({ UInt64($0) }) else {
            call.reject("transactionId fehlt", "bad_request")
            return
        }
        Task {
            for await result in StoreKit.Transaction.unfinished {
                if case .verified(let t) = result, t.id == id { await t.finish() }
            }
            call.resolve()
        }
    }

    // „Käufe wiederherstellen“: gleicht mit dem App Store ab und liefert die dauerhaften Käufe (Designs) dieser Apple-ID.
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            try? await AppStore.sync()
            var out: [[String: Any]] = []
            for await result in StoreKit.Transaction.currentEntitlements {
                if let e = Self.entry(result) { out.append(e) }
            }
            call.resolve(["transactions": out])
        }
    }

    // Bewertungsfrage von Apple. Ob sie erscheint, entscheidet iOS (höchstens dreimal im Jahr).
    @objc func requestReview(_ call: CAPPluginCall) {
        Task { @MainActor in
            let scene = UIApplication.shared.connectedScenes
                .first { $0.activationState == .foregroundActive } as? UIWindowScene
            if let scene = scene {
                if #available(iOS 16.0, *) {
                    AppStore.requestReview(in: scene)
                } else {
                    SKStoreReviewController.requestReview(in: scene)
                }
            }
            call.resolve()
        }
    }
}
