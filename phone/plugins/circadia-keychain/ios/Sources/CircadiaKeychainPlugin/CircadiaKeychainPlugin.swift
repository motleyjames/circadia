import Foundation
import Capacitor
import Security

private let service = "Circadia"

@objc(CircadiaKeychainPlugin)
public class CircadiaKeychainPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "CircadiaKeychainPlugin"
  public let jsName = "CircadiaKeychain"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
  ]

  @objc func set(_ call: CAPPluginCall) {
    let account = call.getString("account") ?? ""
    let value = call.getString("value") ?? ""
    guard !account.isEmpty, !value.isEmpty else {
      call.resolve(["ok": false])
      return
    }
    let payload: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(payload as CFDictionary)
    var add = payload
    add[kSecValueData as String] = value.data(using: .utf8) as Any
    add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    let status = SecItemAdd(add as CFDictionary, nil)
    call.resolve(["ok": status == errSecSuccess])
  }

  @objc func get(_ call: CAPPluginCall) {
    let account = call.getString("account") ?? ""
    guard !account.isEmpty else {
      call.resolve(["value": NSNull()])
      return
    }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) else {
      call.resolve(["value": NSNull()])
      return
    }
    call.resolve(["value": value])
  }

  @objc func remove(_ call: CAPPluginCall) {
    let account = call.getString("account") ?? ""
    guard !account.isEmpty else {
      call.resolve(["ok": false])
      return
    }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
    call.resolve(["ok": true])
  }
}
