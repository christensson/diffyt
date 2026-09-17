import {memo} from 'react';

import {fetchDateFormat} from '@/common/compare/date-format';
import {ARTICLE} from '@/common/compare/entity';
import {CompareApp} from '@/common/compare/compare-app';

const host = await YTApp.register();
const dateFormat = await fetchDateFormat(host, YTApp.locale);

const AppComponent = () => (
  <CompareApp host={host} adapter={ARTICLE} entityId={YTApp.entity?.id} dateFormat={dateFormat}/>
);

export const App = memo(AppComponent);
