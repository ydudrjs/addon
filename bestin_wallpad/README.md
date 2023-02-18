# HDC 베스틴 월패드 RS485 Add-on 

![Supports aarch64 Architecture][aarch64-shield] ![Supports amd64 Architecture][amd64-shield] ![Supports armhf Architecture][armhf-shield] ![Supports armv7 Architecture][armv7-shield] ![Supports i386 Architecture][i386-shield]

## 소개

* 베스틴 월패드를 사용하는 집에서 사용가능한 애드온 입니다. (월패드 버전 1.0).
* MQTT discovery를 이용하여, /통합구성요소/mqtt/기기(bestin_wallpad) 탭에 본인 집 환경에 따라 디바이스가 추가 됩니다.
* 3월 이후로부터 업데이트에 대한 지원이 없습니다.. 

### 지원 목록
* 해당 기기가 월패드에서 조작및 상태 조회가 가능한 상태여야 합니다.
* 지원 기능
    * 조명
    * 콘센트 (전원, 대기전력차단, 현재전력사용량)
    * 난방
    * 환기 (전열교환기)
    * 가스밸브 (잠금만 지원)
    * 실시간 에너지 사용량 (전기, 난방, 수도, 온수, 가스)

#### 아이파크 단지 서버 연동
* 아이파크 조명은 릴레이 방식으로 처리 됩니다. 그런 이유로 rs485 패킷으로 거실 조명 제어는 불가능합니다. 아이파크 단지 서버를 연동 하여(부가적인 기능들을
  지원합니다.
* 조건
  1. http://www.i-parklife.com 위 주소에서 본인 단지가 있어야 서버 연동이 가능합니다.
  2. 단지 서버 가입이 안되어 있으신 입주민은 먼저 본인 단지 서버ip로 들어가 회원가입을 하신 후 관리사무소에 연락하여 아이디 승인 요청을 받아야 합니다.
* 지원 기능 (가장 최근 목록만 업데이트 됩니다.)
    * 조명 (거실 만)
    * 차량 정보 (입차시간, 차량번호, 주차위치)
    * 택배 정보 (보관날짜, 보관위치, 보관상태)
    * 에너지 사용량 (전체 평균 사용량, 나의 세대 사용량)

#### RS485 연결 장치
* ew11 or usb to rs485 (에너지/컨트롤 포트)
* 기본 2개를 필요로 합니다. 

## 설치
### 1. 준비 사항

* Mosquitto broker 설치
    1. 홈어시스턴트의 Supervisor --> Add-on store에서 Mosquitto broker 선택합니다.
    2. 설치하기를 누른 후 생기는 구성 탭을 누릅니다.
    3. logins: [] 에 원하는 아이디와 비밀번호를 아래와 같은 형식으로 입력합니다. 저장하기를 누르면 자동으로 세 줄로 분리됩니다.
        * logins: [{username: 아이디, password: 비밀번호}]
    5. 정보 탭으로 돌아와 시작하기를 누릅니다.
* MQTT Integration 설치
    1. 홈어시스턴트의 구성하기 --> 통합 구성요소에서 우하단 추가( + ) 를 누른 후 MQTT를 검색하여 선택합니다.
    2. "브로커" 에 HA의 IP주소 입력, "사용자 이름"과 "비밀번호"에 위 Mosquitto의 로그인 정보 입력, "기기 검색 활성화" 후 확인을 누릅니다.

### 2. 애드온 설치, 실행

1. 홈어시스턴트의 Supervisor --> Add-on store에서 우상단 메뉴( ⋮ ) 를 누른 후 "repositories" 선택합니다.
2. "Add repository" 영역에 위 주소를 입력한후 추가하기 버튼을 누릅니다. (https://github.com/harwin1/bestin-v1)
3. homeassistant 재부팅 한후 애드온 스토어 하단에 나타난 "HDC BESTIN WallPad RS485 Addon" 을 선택합니다.
4. "INSTALL" 버튼을 누른 후 "START" 가 나타날 때까지 기다립니다. (수 분 이상 걸릴 수 있습니다)
    1. 설치 중 오류가 발생하면 Supervisor -> System 의 System log 최하단을 확인해봐야 합니다.
5. "START" 가 보이면, 시작하기 전에 "Configuration" 페이지에서 아래 설정을 구성 후 "SAVE" 를 누릅니다.
    1. "ipark_server_enabled": true/false
    2. 1번 항목을 true로 설정했다면 "ipark_server"로 가서 본인 서버 정보를 작성해주세요(서버주소, 아이디, 비밀번호)
    3. mqtt/broker: 위의 "브로커"와 같은 주소 입력
    4. energy_port/ control_port 항목에서 연결타입(serial, socket) 설정후 각 디바이스에 대한 정보를 적어주세요
       serial-> ser_path, socket-> address, port
6. "Info" 페이지로 돌아와서 "START" 로 시작합니다.
    1. 첫 시작 시 회전 애니메이션이 사라질 때까지 기다려주세요.
7. "Log" 페이지에서 정상 동작하는지 확인합니다.

### 3. MQTT 통합 구성요소 설정

* MQTT discovery를 지원하므로, yaml 파일을 구성하지 않아도 됩니다. 단 디버그 등 용도로 구성해야 할 경우에는 위 링크를 참고해보세요
  https://github.com/harwin1/bestin-v1/blob/main/mqtts.yaml  
* 통합 구성요소 페이지에 MQTT가 있고, [ ⋮ ] 를 클릭했을 때 "새로 추가된 구성요소를 활성화" 되어 있어야 합니다.
* MQTT 통합 구성요소에 "bestin_wallpad" 기기가 생성되고 모든 엔티티가 등록됩니다.

## 설정

### energy_port/ control_port:
#### `type` (serial / socket)
* serial: USB to RS485 혹은 TTL to RS485를 이용하는 경우
* socket: EW11을 이용하는 경우

### serial: (_port\type 가 serial 인 경우)
#### `ser_path`
* Supervisor -> System -> HARDWARE 버튼을 눌러 serial에 적혀있는 장치 이름을 확인해서 적어주세요.
* USB to RS485를 쓰신다면 /dev/ttyUSB0, TTL to RS485를 쓰신다면 /dev/ttyAMA0 일 가능성이 높습니다.
* 단, 윈도우 환경이면 COM6 과 같은 형태의 이름을 가지고 있습니다.

### socket: (_port\type 가 socket 인 경우)
#### `address`
* EW11의 IP를 적어주세요.
#### port (기본값: 8899)
* EW11의 포트 번호를 변경하셨다면 변경한 포트 번호를 적어주세요.

### MQTT:
#### `broker`
* MQTT broker (Mosquitto)의 IP를 적어주세요. 일반적으로 HA가 돌고있는 서버의 IP와 같습니다.

#### port (기본값: 1883)
* Mosquitto의 포트 번호를 변경하셨다면 변경한 포트 번호를 적어주세요.

#### `username, password`
* Mosquitto의 아이디와 비밀번호를 적어주세요.

#### discovery_register (true / false)
* false로 변경하면 HA에 장치를 자동으로 등록하지 않습니다. 직접 yaml파일 구성이 필요합니다.

#### prefix (기본값: bestin)
* MQTT topic의 시작 단어를 변경합니다. 기본값으로 두시면 됩니다.

### ipark_server:
* 단지 서버 연결을 위해 서버 계정 정보를 입력합니다. 
* address / username / password 필수 항목입니다.

### ipark_server_device:
* 단지 서버에서 가져올 기기 목록을 설정합니다. (true/ false)

### rs485:
#### retry_delay (기본값: 100)
* 실행한 명령에 대해서 응답 ack를 받지 못했을 경우 재 명령을 시도 합니다. 이때 재 명령 시도 사이의 간격을 조절합니다.

#### retry_count (기본값: 20)
* 실행한 명령에 대해서 응답 ack를 받지 못했을 경우 재 명령를 시도할 횟수입니다. 시리얼로 연결했을 경우에는 10번 이내에 명령 성공이지만 
  ew11 같은 경우 무선 딜레이 경우에 따라 20번으로 동작 안하는 경우가 생길수 있습니다(무선 연결이 튀는경우..등). 이때는 본인 환경에 맞게 조절하면 됩니다.

#### ipark_server_enabled (기본값: false)
* 단지서버 연동 기능을 활성화/ 비활성화 합니다. true로 설정할 경우 "ipark_server"에 계정 정보 기입이 필요합니다.
#### ipark_server_scan (기본값: 300s)
* 단지서버 상태 조회 간격을 조절합니다. 기본값 5분 너무 빠르게 설정할 경우 서버에 지속적인 요청때문에 조작이 안되는 상황이 발생할수 있습니다.
  HA에서 거실 조명을 조작하면 상태는 바로 반영이 됩니다. 
  
#### packet_log_enabled (기본값: false)
* RS485 패킷을 캡처할 수 있습니다. 
#### packet_log_time (기본값: 30s)
* RS485 패킷 캡쳐 시간을 설정합니다. 기본값 30초 

### file_name:
#### packet_log (기본값: ./cookie_info.json)
* 파일 이름및 저장 경로를 설정합니다.

## 지원
[HomeAssistant 네이버 카페 (질문, 수정 제안 등)](https://cafe.naver.com/koreassistant)

[Github issue 페이지 (버그 신고, 수정 제안 등)](https://github.com/harwin1/bestin-v1/issues)

---

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armhf-shield]: https://img.shields.io/badge/armhf-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
[i386-shield]: https://img.shields.io/badge/i386-yes-green.svg