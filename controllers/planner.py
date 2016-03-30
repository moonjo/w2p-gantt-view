import sys
import re
import datetime
import logging
import logging.config
import gluon.contrib.simplejson

# shotgun
sys.path.append('/X/tools/pythonlib')
from shotgun_api3 import Shotgun

SG = Shotgun(sg_server, sg_script_name, sg_script_key)


session.departments = []
if not session.departments:
        session.departments = SG.find('Department', [['sg_status_list', 'is', 'act']],
                                      fields=['code', 'name', 'color'],
                                      order=[{'field_name':'name', 'direction':'asc'}]
                                      )
session.dept_to = []
session.dept_ny = []
for d in session.departments:
    if d['code'].upper().startswith('NY'):
        session.dept_ny.append(d['id'])
    else:
        session.dept_to.append(d['id'])

PROJECT_STATUS = ['Active', 'Bidding', 'Demo/Test', 'Delivered']

if not session.projects:
    result = SG.find('Project', [['sg_status', 'in', PROJECT_STATUS]],
                     fields=['code','name', 'color', 'sg_status'],
                     order=[{'field_name':'name', 'direction':'asc'}]
                     )
    ps = sorted(result, key=lambda x:x['name'] if not x['name'].startswith('The ') else x['name'][4:])
    session.projects = ps
    
VACATION_TASK = 43465

IGNORE_PROJECTS = [4, 75, 80, 116, 120, 142,] # demo, mrx_template, mrx, mrx_assets, tools, ryan
IGNORE_TASK_PROJECTS = [80] # mrx
IGNORE_TASKS = ['Milestone']
IGNORE_TASK_CONTENT = 'Lead Time'
IGNORE_STATUS = ['na']

TODAY = datetime.date.today()

def getProject(project_code='', project_id=None):
    """Returns Project entity
    
    :param project_code: Project code
    :param project_id: Project id (default None)
    :returns: Project entity
    
    >>> getProject('mrx').get('id')
    80
    """
    if session.projects:
        for p in session.projects:
            if project_id and p['id'] == project_id:
                return p
            elif p['code'] == project_code or p['name'] == project_code:
                return p
    else:
        if project_code:
            cond = [['code', 'is', project_code]]
        elif project_id:
            cond = [['id', 'is', int(project_id)]]
        else:
            return None
        return SG.find_one('Project', cond, fields=['name', 'code', 'sg_quicktime_output_format'])
    return None

@auth.requires_login()
def index():
    """
    """
    default_colour = '#505050'
    project_colour_map = {'mrx':['#ddd', '#333'], 'vac':['#e6e6e6', '#333']}
    
    for p in session.projects:
        key = p['code']
        font_colour = '#eee'
        if p['color']:
            project_colour = rgb_to_hex(tuple(p['color'].split(',')))
            cr = contrast_ratio('#eee', project_colour)
            if cr < 3:
                font_colour = '#333'
        else:
            project_colour = default_colour
        project_colour_map[key] = [project_colour, font_colour]
    
    # department colour map
    department_colour_map = {}
    for d in session.departments:
        key = d['code']
        font_colour = '#eee'
        if d['color']:
            dept_colour = rgb_to_hex(tuple(d['color'].split(',')))
            cr = contrast_ratio('#eee', dept_colour)
            if cr < 3:
                font_colour = '#333'
        else:
            dept_colour = '#505050'
        department_colour_map[key] = [dept_colour, font_colour]
        
    username = auth.user.username
    
    sgme = SG.find_one('HumanUser', [['login', 'is', username]], fields=['department'])
    my_department_id = sgme['department']['id']
    
    theme = 'light'
    
    deptopts = [OPTION('ALL', _class='department-option', _value=0),
                OPTION('TORONTO', _class='department-option', _value=-1),
                OPTION('GOTHAM', _class='department-option', _value=-2),
                ]
    
    toropts = []
    nyopts = []
    
    for d in session.departments:
        if d['id'] == my_department_id:
            fopt = OPTION(d['name'],
                          _class='department-option',
                          _value=d['id'],
                          _selected='selected',
                          )
        else:
            fopt = OPTION(d['name'],
                          _class='department-option',
                          _value=d['id'],
                          )
            
        if d['name'].lower().startswith('ny'):
            nyopts.append(fopt)
        else:
            toropts.append(fopt)
        
    deptopts.append(OPTGROUP(toropts, _label='Toronto'))
    deptopts.append(OPTGROUP(nyopts, _label='Gotham'))
    deptselect = SELECT(deptopts, _id='department-picker', _multiple='multiple')
    
    # starting data
    dept_selected = my_department_id#4
    dept_users, user_depts = get_minions([dept_selected]) # shotgun humanuser
    dept_userids = [u['id'] for u in dept_users]
    date_range = 'month'
    
    bookings = get_bookings(dept_userids, date_condition(date_range, nones=True))
    tasks = get_tasks(dept_userids, date_condition(date_range, end_field='due_date', nones=True))
    
    data_bookings = json_bookings(user_depts, bookings)
    data_tasks = json_tasks(dept_users, tasks)
    
    usernames = sorted([du['name'] for du in dept_users])
    project_codes = dict([(v['name'],v['code']) for v in filter(lambda x: x['code'], session.projects)])
    
    return dict(project_codes=project_codes,
                project_colour_map=project_colour_map,
                department_colour_map=department_colour_map,
                dept_select=deptselect,
                dept_selected=dept_selected,
                bookings=data_bookings,
                tasks=data_tasks,
                date_range=date_range,
                theme=theme,
                project_code='',
                user=username,
                users=dept_users,
                uargs='',
                tag_style='',
                )

def ajax_bookings():
    """Ajax get_bookings()
    """
    dept_ids = map(lambda x:int(x), gluon.contrib.simplejson.loads(request.vars.departments))
    date_range = request.vars.range
    today_offset = int(request.vars.today)
    
    if 0 in dept_ids:
        dept_ids = session.dept_to + session.dept_ny
    elif -1 in dept_ids:
        dept_ids = session.dept_to
    elif -2 in dept_ids:
        dept_ids = session.dept_ny
    
    dept_users, user_depts = get_minions(dept_ids)
    dept_userids = [u['id'] for u in dept_users]
    usernames = [u['name'] for u in dept_users]
    
    direction = request.vars.direction
    
    date_start = request.vars.datestart
    if date_start:
        date_start = datetime.datetime.strptime(date_start, '%Y-%m-%d').date()
    
    date_end = request.vars.dateend
    if date_end:
        date_end = datetime.datetime.strptime(date_end, '%Y-%m-%d').date()
    
    # no custom atm
    if date_range == 'custom':
        date_range = 'all'
    
    begin = TODAY
    end = TODAY
    domain = ''
    if isinstance(date_end, datetime.date):
        if direction == 'forward':
            begin = date_end
            y = begin.year
            m = begin.month
            
            if date_range == 'week':
                end = begin + datetime.timedelta(days=7)
            elif date_range == 'month':
                if m == 12:
                    m = 1
                    y += 1
                else:
                    m += 1
                end = datetime.datetime(y, m, 1)
            elif date_range == 'semi':
                if m > 6:
                    m -= 6
                    y += 1
                else:
                    m += 6
                end = datetime.datetime(y, m, 1)
            elif date_range == 'year':
                end = datetime.datetime(y+1, m, 1)
                
        elif direction == 'back':
            end = date_start
            y = end.year
            m = end.month
            
            if date_range == 'week':
                begin = end - datetime.timedelta(days=7)
            elif date_range == 'month':
                if m == 1:
                    m = 12
                    y -= 1
                else:
                    m -= 1
                begin = datetime.datetime(y, m, 1)
            elif date_range == 'semi':
                if m < 7:
                    m += 6
                    y -= 1
                else:
                    m -= 6
                begin = datetime.datetime(y, m, 1)
            elif date_range == 'year':
                begin = datetime.datetime(y-1, m, 1)
                
        if isinstance(begin, datetime.datetime):
            begin = begin.date()
        if isinstance(end, datetime.datetime):
            end = end.date()
        
        #domain = [begin, end+datetime.timedelta(1)]
        domain = [begin, end]
    
    bookings_date_cond = date_condition(date_range, nones=True, today_offset=today_offset, begin=begin)
    tasks_date_cond = date_condition(date_range, end_field='due_date', nones=True, today_offset=today_offset, begin=begin)
    
    data_bookings = json_bookings(user_depts, get_bookings(dept_userids, bookings_date_cond))
    data_tasks = json_tasks(dept_users, get_tasks(dept_userids, tasks_date_cond))
    
    result = {'bookings': data_bookings,
              'tasks': data_tasks,
              'users': dept_users,
              'domain':domain,
              }
    return response.json(result)

def json_bookings(user_depts, dataset, mode='booking'):
    """Returns bookings and tasks in a chart usable json format
    """
    from collections import defaultdict
    user_bookings = defaultdict(list)
    
    for booking in dataset:
        username = booking['user']['name']
        userid = booking['user']['id']
        
        project_ent = None
        if booking['project']:
            project_ent = getProject(project_id=booking['project']['id'])
            
        if project_ent:
            projectname = project_ent['name']
            projectcode = project_ent['code']
            projectid = project_ent['id']
        else:
            projectname = booking['cached_display_name']
            projectcode = 'bar'
            projectid = 0
            
        if booking['vacation']:
            projectname = 'Vacation'
            projectcode = 'vac'
            projectid = VACATION_TASK
        
        note = booking['note'] if booking['note'] else ''
        
        dept_code = user_depts.get(booking['user']['id'])
        
        bar = {'sgid': booking['id'],
               'name': projectname,
               'entityname': booking['cached_display_name'],
               'projectname': projectname,
               'projectcode': projectcode,
               'projectid': projectid,
               'username': booking['user']['name'],
               'userid': booking['user']['id'],
               'deptcode': dept_code,
               'created_at': booking['created_at'],
               'created_by': booking['created_by'],
               'updated_at': booking['updated_at'],
               'updated_by': booking['updated_by'],
               'start_date': booking['start_date'].replace('-','/'),
               'end_date': booking['end_date'].replace('-','/') + " 23:59:59",
               'prev_b_date': '',
               'next_b_date': '',
               'stack': 1,
               'z':0,
               }
        
        user_bookings[booking['user']['name']].append(bar)
    
    for u in user_bookings.itervalues():
        for a, b in combinations(u, 2):
            if date_overlaps(a, b) > 0:
                #a['stack'] += 1
                b['stack'] += 1
                if b['stack'] > a['stack']:
                    a['stack'] += 1
                    
                # adjust y-offset
                if str_to_date(a['start_date']) > str_to_date(b['start_date']):
                    a['z'] += 1
                elif a['z'] <= b['z']:
                    b['z'] += 1
    
    return response.json([val for subl in user_bookings.values() for val in subl])

def json_tasks(users, dataset):
    """Returns bookings and tasks in a chart usable json format
    
    :param users: list of HumanUser entities
    :param dataset:
    
    """
    
    def getUser(uid):
        for u in users:
            if u['id'] == uid:
                return u
        return None
    
    from collections import defaultdict
    user_tasks = defaultdict(list)
    
    for task in dataset:
        project_ent = None
        if task['project']:
            project_ent = getProject(project_id=task['project']['id'])
            
        if project_ent:
            projectname = project_ent['name']
            projectcode = project_ent['code']
            projectid = project_ent['id']
        else:
            projectname = task['content']
            projectcode = 'bar'
            projectid = 0
        
        shotgunurl = 'shotgun.mrxfx.com/detail/Task/%d' % task['id']
        
        entity_id = ''
        entity_code = ''
        entity_type = ''
        if task['entity']:
            entity_name = task['entity']['name']
            entity_id = task['entity']['id']
            entity_type = task['entity']['type']
            shotgunurl = 'shotgun.mrxfx.com/detail/%s/%d' % (entity_type, entity_id)
            
        start_date = "1970/01/01"
        if task['start_date']:
            start_date = task['start_date'].replace('-','/')
        
        end_date = "2070/12/31 23:59:59"
        if task['due_date']:
            end_date = task['due_date'].replace('-','/') + " 23:59:59"
        
        note = task['sg_description'] if task['sg_description'] else ''
        
        bar = {'sgid': task['id'],
               'username': '',
               'name': task['content'],
               'entityname': entity_name,
               'entityid': entity_id,
               'description': note,
               'projectname': projectname,
               'projectcode': projectcode,
               'projectid': projectid,
               'shotgunurl': shotgunurl,
               'start_date': start_date,
               'end_date': end_date,
               'stack': 1,
               'z':0,
               }
        # add this to all users in task_assignees
        for t in task['task_assignees']:
            u = getUser(int(t['id']))
            if u:
                tbar = bar.copy()
                tbar['username'] = u['name']
                user_tasks[u['name']].append(tbar)
                
    
    grouped_tasks = defaultdict(list)
    
    for username, v in user_tasks.iteritems():
        last_item = v[-1]['sgid']
        sgids = set()
        grouping = []
        
        for a, b in combinations(v, 2):
            # date range overlaps and both belong to same project
            overlapping = date_overlaps(a, b) > 0
            if overlapping and (a['projectid'] == b['projectid']):
                # overlaps
                added = False
                for g in grouping:
                    if a in g or b in g:
                        added = True
                        if not a in g:
                            g.append(a)
                        elif not b in g:
                            g.append(b)
                        break
                if not added:
                    grouping.append([a,b])
                sgids.add(a['sgid'])
                sgids.add(b['sgid'])
            else:
                # doesn't overlap
                exists = False
                for g in grouping:
                    if a in g:
                        exists = True
                        break
                if not exists:
                    grouping.append([a])
                    sgids.add(a['sgid'])
                #if len(v) == 2 and a != b:
                #if not b['sgid'] in sgids:
                #    grouping.append([b])
                #    sgids.add(b['sgid'])
                    
                '''
                # if different project tasks, stagger
                if overlapping:#if a['projectid'] != b['projectid']:
                    if b['stack'] > a['stack']:
                        a['stack'] += 1
                    # adjust y-offset
                    if str_to_date(a['start_date']) > str_to_date(b['start_date']):
                        if a['z'] == b['z']:
                            a['z'] += 1
                    else:
                        if a['z'] == b['z']:
                            b['z'] += 1
                '''
        #if not last_item in sgids:
        #    grouping.append([b])
        
        grouped_tasks[username] = grouping
        
    
    # iterate grouped tasks and set depth and join all task groups into a long task
    result = []
    for k,v in grouped_tasks.iteritems():
        """
        if k == 'Paul Wishart':
            '''for vv in v:
                if vv[0]['projectname'] == 'Haunted Peak':
                    print 'BEFORE:', vv'''
            print ' GO', len(h)
            for hh in h:
                if hh['projectname'] == 'Haunted Peak': print 'MID:', hh
                
        """
        result.extend(reduce_tasks(v))
    """
    c = []
    for r in result:
        if r['username'] == 'Paul Wishart' and r['projectname'] == 'Haunted Peak':
            c.append(r)
    #return response.json([val for subl in user_tasks.values() for val in subl])
    """
    return response.json(result)

def reduce_tasks(taskgroups):
    """Group of tasks into a dict with tasks stored in its list
    
    :param taskgroups: list of user tasks
    
    :returns: dict of task group
    """
    #if username == 'Paul Wishart': print ' ReduceStart', len(taskgroups)
    result = []
    for tasklist in taskgroups:
        # get the earliest start_date and latest end date
        start_date = min(t['start_date'] for t in tasklist)
        end_date = max(t['end_date'] for t in tasklist)
        
        projectname = tasklist[0]['projectname']
        projectcode = tasklist[0]['projectcode']
        projectid = tasklist[0]['projectid']
        
        #stack = tasklist[0]['stack']
        #z = tasklist[0]['z']
        stack = 1
        z = 0
        
        taskdata = {'sgid': ''.join(sorted([str(t['sgid']) for t in tasklist])),
                    'username': tasklist[0]['username'],
                    'name': projectname,
                    'projectname': projectname,
                    'projectcode': projectcode,
                    'projectid': projectid,
                    'start_date': start_date,
                    'end_date': end_date,
                    'items': tasklist,
                    'stack': stack,
                    'z': z,
                    }
        result.append(taskdata)
    #if username == 'Paul Wishart': print ' ReduceMid', len(result)
    # iterate grouped tasks and set depth
    for a, b in combinations(result, 2):
        overlapping = date_overlaps(a, b) > 0
        if overlapping:#if a['projectid'] != b['projectid']:
            if b['stack'] > a['stack']:
                a['stack'] += 1
            # adjust y-offset
            if str_to_date(a['start_date']) > str_to_date(b['start_date']):
                a['z'] += 1
            else:
                b['z'] += 1
    
    #if username == 'Paul Wishart': print ' ReduceEnd', len(result)
    
    return result

def get_bookings(sguserids, date_cond=None):
    """Returns list of Booking entities for users in department
    """
    if not sguserids:
        return []
        
    c = [{'path':'user.HumanUser.id', 'relation':'in', 'values':sguserids}]
    
    #if date_range != 'all':
    #    c.append(date_condition(date_range, today_offset=today_offset))
    if date_cond:
        c.append(date_cond)
        
    conds = {'logical_operator':'and', 'conditions':c}
    bookings = SG.find('Booking',
                       conds,
                       fields=['end_date', 'sg_lead_manager',
                               'start_date', 'sg_status_list', 'created_at',
                               'created_by','updated_at', 'updated_by', 'user',
                               'note', 'project', 'vacation',
                               'cached_display_name',
                               ],
                       order=[{'field_name':'start_date', 'direction':'asc'}]#order=[{'field_name':'user', 'direction':'asc'}]
                       )
    return bookings

def get_tasks(userids, date_cond=None, projid=None, due=None, sorter=False):
    """Get user SG tasks
    
    :param userids: Shotgun HumanUser ids (list of int)
    :param date_range: start and end date range of Tasks
    :returns: list of Task entities (shotgun)
    
    >>> len(get_user_tasks([328])) > 0
    True
    """
    if not userids:
        return []
    
    # user Task condition
    # Task status: Active, CouldBeBetter, InProgress, Pinned, Ready, Revision
    
    user_filter = {'path':'task_assignees.HumanUser.id', 'relation':'in', 'values':userids}
    status_filter = {'path':'sg_status_list','relation':'in','values':['act', 'cbb', 'ip', 'pin', 'rdy', 'rev']}
    step_filter = {'path':'step.Step.code','relation':'is_not','values':['Milestone']}
    content_filter = {'path':'content','relation':'is_not','values':[IGNORE_TASK_CONTENT]}
    c = [user_filter, status_filter, step_filter, content_filter]
    
    #if date_range != 'all':
    #    c.append(date_condition(date_range, end_field='due_date', nones=True, today_offset=today_offset))
    if date_cond:
        c.append(date_cond)
        
    if projid:
        c.append({'path':'project.Project.id','relation':'is','values':[int(projid)]})
        
    if due:
        if due == 'thisweek':
            # get this sunday
            duesun = TODAY + timedelta(6-TODAY.weekday())
        else:
            # get next sunday
            duesun = TODAY + timedelta(13-TODAY.weekday())
            
        c.append({'path':'due_date','relation':'less_than','values':[duesun.strftime('%Y-%m-%d')]})
        
    # is this for the PM task sorter?
    if sorter:
        c.append({'path':'project.Project.id','relation':'not_in','values':[80]})
        
    result = SG.find('Task',
                    {'logical_operator':'and', 'conditions':c},
                    fields=['content',
                            'start_date',
                            'due_date',
                            'entity',
                            'project',
                            'sg_description',
                            'task_assignees'
                            ],
                    order=[{'field_name':'start_date', 'direction':'asc'},
                           {'field_name':'entity', 'direction':'asc'},
                           ]
                    )
    return result

def date_condition(date_range, start_field='start_date', end_field='end_date', nones=False, today_offset=False, begin=TODAY):
    """Returns Shotgun date condition
    
    :param date_range: date range string
    :param start_field: start date field name (default start_date)
    :param end_field: end date field name (default end_date)
    :param nones: allow None date field values (boolean)
    
    :returns: Shotgun query condition dict
    """
    date_range = date_range.lower()
    if date_range == 'all':
        return
    
    none_filter = {'logical_operator': 'or',
                   'conditions': [
                       {'path':start_field, 'relation':'is', 'values':[None]},
                       {'path':end_field, 'relation':'is', 'values':[None]}
                       ]
                   }
    
    date_filter = []
    if date_range == 'week':
        bound_start = begin - datetime.timedelta(begin.weekday())
        if today_offset:
            bound_start = TODAY - datetime.timedelta(1)
        bound_end = bound_start + datetime.timedelta(6)
        date_filter = [{'logical_operator': 'or',
                       'conditions': [
                           {'path':start_field, 'relation':'in_calendar_week', 'values':[0]},
                           {'path':end_field, 'relation':'in_calendar_week', 'values':[0]}
                           ]
                       },
                       {'logical_operator': 'and',
                       'conditions': [
                           {'path':start_field, 'relation':'less_than', 'values':[bound_start]},
                           {'path':end_field, 'relation':'greater_than', 'values':[bound_end]}
                           ]
                       }]
        if nones:
            date_filter.append(none_filter)
            
    elif date_range == 'month':
        # this month
        bound_start = datetime.date(begin.year, begin.month, 1)
        if today_offset:
            bound_start = TODAY - datetime.timedelta(1)
        bound_end = datetime.date(bound_start.year, bound_start.month+1, bound_start.day) - datetime.timedelta(1)
        date_filter = [{'logical_operator': 'or',
                       'conditions': [
                           {'path':start_field, 'relation':'in_calendar_month', 'values':[0]},
                           {'path':end_field, 'relation':'in_calendar_month', 'values':[0]}
                           ]
                       },
                       {'logical_operator': 'and',
                       'conditions': [
                           {'path':start_field, 'relation':'less_than', 'values':[bound_start]},
                           {'path':end_field, 'relation':'greater_than', 'values':[bound_end]}
                           ]
                       }]
        if nones:
            date_filter.append(none_filter)
            
    elif date_range == 'semi':
        # starting from this month
        bound_start = datetime.date(begin.year, begin.month, 1)
        if today_offset:
            bound_start = TODAY - datetime.timedelta(7)
            
        end_year = bound_start.year
        end_month = bound_start.month + 6
        if end_month > 12:
            end_year += 1
            end_month -= 12
        bound_end = datetime.date(end_year, end_month, bound_start.day) - datetime.timedelta(1)
        date_filter = [{'logical_operator': 'or',
                       'conditions': [
                           {'path':start_field, 'relation':'between', 'values':[bound_start, bound_end]},
                           {'path':end_field, 'relation':'between', 'values':[bound_start, bound_end]}
                           ]
                       },
                       {'logical_operator': 'and',
                       'conditions': [
                           {'path':start_field, 'relation':'less_than', 'values':[bound_start]},
                           {'path':end_field, 'relation':'greater_than', 'values':[bound_end]}
                           ]
                       }]
        if nones:
            date_filter.append(none_filter)
        
    elif date_range == 'year':
        bound_start = datetime.date(begin.year, 1, 1)
        if today_offset:
            bound_start = TODAY - datetime.timedelta(30)
        bound_end = datetime.date(bound_start.year+1, 1, 1) - datetime.timedelta(1)
        date_filter = [{'logical_operator': 'or',
                       'conditions': [
                           {'path':start_field, 'relation':'in_calendar_year', 'values':[0]},
                           {'path':end_field, 'relation':'in_calendar_year', 'values':[0]}
                           ]
                       },
                       {'logical_operator': 'and',
                       'conditions': [
                           {'path':start_field, 'relation':'less_than', 'values':[bound_start]},
                           {'path':end_field, 'relation':'greater_than', 'values':[bound_end]}
                           ]
                       }]
        if nones:
            date_filter.append(none_filter)
            
    return {'logical_operator':'or', 'conditions':date_filter}

def get_minions(department_ids, project_codes=None):
    """Returns a list of artists (HumanUser) in department or assigned to project
    
    :param department_ids: list of Department id (int)
    :param project_codes: list of Project codes for filtering artists
    :returns: list of HumanUser entities
    
    >>> len(get_minions('jimp', 11)) > 0
    True
    """
    active_filter = {'path':'sg_status_list', 'relation':'is', 'values':['act']}
    dept_filter = {'path':'department.Department.id', 'relation':'in', 'values':department_ids}
    cond = [active_filter, dept_filter]
    
    if project_codes:
        proj_cond = []
        for project_code in project_codes:
            proj_filter = {'path':'projects.Project.code',
                           'relation':'is',
                           'values':[project_code]}
            proj_cond.append(proj_filter)
        cond.append({'logical_operator':'or', 'conditions':proj_cond})
    
    condition = {'logical_operator':'and', 'conditions':cond}
    users = SG.find('HumanUser', condition,
                     fields=['login', 'name', 'image',
                             'projects', 'department',
                             ],
                     order=[{'field_name':'name', 'direction':'asc'}]
                     )
    #session.departments
    
    user_depts = {}
    for u in users:
        # get department code
        dept = u['department']
        for d in session.departments:
            if d['id'] == dept['id']:
                dept['code'] = d['code']
        
        user_depts[u['id']] = dept['code']
        
        if not u['image']:
            u['image'] = URL('static', 'images/humanuser_thumb.png')
    
    return users, user_depts

def combinations(iterable, r):
    pool = tuple(iterable)
    n = len(pool)
    if r > n:
        return
    indices = range(r)
    yield tuple(pool[i] for i in indices)
    while True:
        for i in reversed(range(r)):
            if indices[i] != i + n - r:
                break
        else:
            return
        indices[i] += 1
        for j in range(i+1, r):
            indices[j] = indices[j-1] + 1
        yield tuple(pool[i] for i in indices)

def str_to_date(d):
    if d.find('/') > -1:
        return datetime.datetime.strptime(d, '%Y/%m/%d')
    else:
        return datetime.datetime.strptime(d, '%Y-%m-%d')

def js_date(d):
    if isinstance(d, str):
        tmp = d.split('-')
        return "new Date(%s, %s, %s)" % tuple(tmp)
    elif isinstance(d, date) or isinstance(d, datetime):
        return "new Date(%d, %d, %d)" % (d.year, d.month, d.day)

def epoch_time(d):
    if not isinstance(d, datetime.datetime):
        if re.match('^\d{4}/\d{2}/\d{2}$', d):
            d = datetime.datetime.strptime(d, '%Y/%m/%d')
        elif re.match('^\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}$', d):
            d = datetime.datetime.strptime(d, '%Y/%m/%d %H:%M:%S')
        else:
            return None
    t = d - datetime.datetime(1970,1,1)
    return (t.seconds + t.days * 24 * 3600) * 1000 # milliseconds

def milliseconds(dt):
    """Converts datetime to milliseconds since epoch
    """
    epoch = datetime.datetime.utcfromtimestamp(0)
    delta = dt - epoch
    t = delta.days*86400 + delta.seconds + delta.microseconds/1e6
    return int(t * 1000)

def date_overlaps(a, b):
        astart = str_to_date(a['start_date'])
        aend = str_to_date(a['end_date'].split()[0])
        bstart = str_to_date(b['start_date'])
        bend = str_to_date(b['end_date'].split()[0])
        r1 = (astart, aend)
        r2 = (bstart, bend)
        latest_start = max(r1[0], r2[0])
        earliest_end = min(r1[1], r2[1])
        overlap = (earliest_end - latest_start).days + 1
        return overlap

def roundPartial(value, precision=0.01):
    """Round to given precision. Default to one thousandth
    """
    return round(value / precision) * precision

# Contrast ratio functions
def hex_to_rgb(val):
    """Converts hex value to rgb value
    
    :param val: hex value
    :returns: rgb value
    """
    val = val.lstrip('#')
    lv = len(val)
    if lv == 3 and val[0]*lv == val:
        val = val * 2
        lv = len(val)
    return tuple(int(val[i:i+lv/3], 16) for i in range(0, lv, lv/3))

def rgb_to_hex(val):
    """Converts rgb value to hex value
    
    :param val: rgb value
    :returns: hex value
    """
    # val = 3-int-tuple
    v = tuple(map(lambda x: int(x), list(val)))
    return '#%02x%02x%02x' %v

def norm(val):
    """Normalize
    
    :param val: rgb
    :returns: normalized value
    """
    v = val / 255.0
    if v < 0.03928:
        return v / 12.92
    else:
        return ((v + 0.055) / 1.055) ** 2.4

def luminance(rgb):
    """Calculates luminance of rgb
    
    :param rgb: rgb value
    :returns: luminance
    """
    r, g, b = map(norm, rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast_ratio(fg, bg, mode='hex'):
    """Calculate contrast between 2 colour values
    
    :param fg: foreground colour
    :param bg: background colour
    :param mode: hex or rgb
    :returns: contrast ratio
    """
    if mode == 'hex':
        # convert hex to rgb
        c1 = hex_to_rgb(fg)
        c2 = hex_to_rgb(bg)
    else:
        c1 = fg
        c2 = bg
    l1 = luminance(c1)
    l2 = luminance(c2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    cratio = roundPartial((lighter + 0.05) / (darker + 0.05))
    return cratio
