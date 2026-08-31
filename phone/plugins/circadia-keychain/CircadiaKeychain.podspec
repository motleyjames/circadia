Pod::Spec.new do |s|
  s.name = 'CircadiaKeychain'
  s.version = '0.7.0'
  s.summary = 'iOS Keychain for the Circadia diary stay-signed-in key.'
  s.license = { :type => 'UNLICENSED' }
  s.homepage = 'https://github.com/motleyjames/circadia'
  s.author = 'James Motley'
  s.source = { :git => 'https://github.com/motleyjames/circadia.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
