import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = GameViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// Spielansicht: Wischgesten vom Rand erst beim zweiten Wischen an das System geben, damit beim Kämpfen am
// Bildschirmrand nicht versehentlich die App verlassen wird. Statusleiste und Home-Strich blendet SystemBars aus
// (capacitor.config.json). Käufe und Bewertungsfrage: StorePlugin.swift. Anmeldung mit Apple/Google und Schlüsselbund:
// AuthPlugin.swift. Mitteilungen: PushPlugin.swift. Neue Plugins: Stufe in appendUserAgent erhöhen (src/app/native.js).
class GameViewController: CAPBridgeViewController {
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(EmberStorePlugin())
        bridge?.registerPluginInstance(EmberAuthPlugin())
        bridge?.registerPluginInstance(EmberPushPlugin())
    }
}
