# Pattern: Wave 병렬화를 위한 의존성 그래프 설계

- **Observed in**: EP-05 전체 (T-05-000~T-05-014)
- **Category**: efficiency
- **Description**: 15개 태스크를 6개 Wave로 분류하여 독립 태스크를 병렬 실행. Wave 1에 4개 태스크(의존성 없음)를 동시 시작하여 critical path를 단축. EP-04(11태스크/7Wave)보다 EP-05(15태스크/6Wave)가 Wave 수가 적어 더 효율적.
- **Root cause**: 태스크 생성 시 의존성을 최소화하도록 설계하면 병렬화 폭이 넓어짐. 특히 스키마 태스크를 도메인별로 분할하고, 순수 함수 태스크(time-decay, daily-direction)를 의존성 없이 독립 배치.
- **Recommendation**: 태스크 생성 시 "Wave 1에 몇 개 들어가는가?"를 핵심 지표로 활용. 의존성 없는 태스크 비율이 높을수록 전체 실행 시간 단축.
