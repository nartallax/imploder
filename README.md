TODO:

проверить под виндой
проверить удаление модулей в девмоде
понять, как заставить среду ссылаться по абсолютным путям всегда, а не по относительным иногда
опции: что делать с именами асинхронных импортов
трансформер, который не меняет AST, точно должен быть трансформером? может, там есть другие, более легковесные варианты?
посмотреть на опции, которые я разрешаю передавать, там, кажется, есть неиспользуемые
вайтлист/блеклист имен модулей
порефакторить место создания классов типа metastorage, ModulePathResolver и прочих. возможно, Bundler-у не нужен экземпляр Compiler?
выдавать ошибки в http-ручку. завести флаг для этого
действия на удалении файла - удалять js, оповещать трансформеры
выдавать ошибки даже при одноразовой компиляции

ТЕСТЫ:

правильная работа с асинхронными и синхронными require
минификация не выбрасывает !! - приведение к boolean
import по относительному пути, с ../ включительно

ДОКИ:

про dynamic imports
про опции в tsconfig.json
про запрет не-модульных файлов
про скоуп исполнения бандла
про трансформеры

Про require:
TL;DR: preferCommonjs = true для сборки под NodeJS, false для сборки под браузер  
Тулу можно сообщить два варианта require - amdRequire и commonjsRequire, а также передавать флаг preferCommonjs.  
amdRequire будет использован в случае, когда из кода явно асинхронно запрошена зависимость; commonjsRequire - когда явно синхронно. preferCommonjs определяет, как именно следует подгружать зависимости в случае, когда их требует какой-либо еще модуль (и их определения нет у лоадера).  
Обычно в среде исполнения определена только одна из этих функций, и она известна под именем require, так что явно указывать amdRequire и commonjsRequire нужно только в случае, если вы хотите передать туда какую-нибудь другую функцию. preferCommonjs следует задавать true для исполнения в среде NodeJS и false - для браузера. Это будет изменять ожидания лоадера от require.  
Из этого следует, что при такой конфигурации без явных дополнительных усилий в браузере не будет работать синхронный require, а в NodeJS - асинхронный.