import {memo} from 'react';

import {fetchDateFormat} from '@/common/compare/date-format';
import {ARTICLE} from '@/common/compare/entity';
import {VersionsApp} from '@/common/compare/versions-app';

const host = await YTApp.register();
const dateFormat = await fetchDateFormat(host, YTApp.locale);

const AppComponent = () => (
  <VersionsApp host={host} adapter={ARTICLE} entityId={YTApp.entity?.id} dateFormat={dateFormat}/>
);

export const App = memo(AppComponent);
