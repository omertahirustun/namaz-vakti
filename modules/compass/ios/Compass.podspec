Pod::Spec.new do |s|
  s.name           = 'Compass'
  s.version        = '1.0.0'
  s.summary        = 'Kıble pusulası (CoreLocation yön verisi)'
  s.author         = ''
  s.homepage       = 'https://github.com/omertahirustun/namaz-vakti'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
end
